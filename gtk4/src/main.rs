mod backend;

use adw::{
    Application, ApplicationWindow, HeaderBar, NavigationPage, OverlaySplitView, ToolbarView,
    WindowTitle, prelude::*,
};
use serde_json::Value;
use std::cell::RefCell;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Child, Command};
use std::rc::Rc;
use std::sync::{Arc, mpsc};
use std::thread;
use std::time::{Duration, Instant};
use webkit6::{
    UserContentInjectedFrames, UserContentManager, UserScript, UserScriptInjectionTime, WebContext,
    WebView, prelude::*,
};

fn main() {
    let dev_mode = std::env::args().any(|arg| arg == "--dev");
    let mut vite = if dev_mode {
        let mut child = match start_vite() {
            Ok(child) => child,
            Err(error) => {
                eprintln!("Could not start the GTK development server: {error}");
                return;
            }
        };
        if let Err(error) = wait_for_vite(&mut child) {
            eprintln!("Could not start the GTK development server: {error}");
            let _ = child.kill();
            return;
        }
        Some(child)
    } else {
        None
    };
    let backend = match backend::Backend::open() {
        Ok(backend) => Arc::new(backend),
        Err(error) => {
            eprintln!("Could not open Grad Notes' data folder: {error}");
            if let Some(vite) = vite.as_mut() {
                let _ = vite.kill();
            }
            return;
        }
    };

    let project_root = std::env::var_os("GRAD_NOTES_RESOURCE_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(".."));
    let app_uri = if dev_mode {
        "http://127.0.0.1:1420".to_string()
    } else {
        let dist = project_root.join("dist");
        let index = dist.join("index.html");
        if !index.is_file() {
            eprintln!(
                "Grad Notes' production files are missing. Run `npm run app:gtk4` to build and launch the app."
            );
            return;
        }
        match serve_dist(&dist, &backend.db.files_dir, &backend.db.data_dir) {
            Ok(uri) => uri,
            Err(error) => {
                eprintln!("Could not start Grad Notes' local content server: {error}");
                return;
            }
        }
    };

    let app = Application::builder()
        .application_id("io.github.paullinux_gn.gradnotes")
        .build();

    app.connect_activate(move |app| {
        // This GTK build deliberately keeps application motion disabled:
        // WebKitGTK and native libadwaita widgets otherwise animate together,
        // which has been producing visible flicker on the user's desktop.
        if let Some(settings) = adw::gtk::Settings::default() {
            settings.set_gtk_enable_animations(false);
        }
        let content_manager = UserContentManager::new();
        let file_base = (!dev_mode).then(|| format!("{}/__tdfile/", app_uri.trim_end_matches('/')));
        prepare_native_bridge(&content_manager, file_base.as_deref());
        let web_context = WebContext::new();
        // The web view only loads this app's local UI and local attachments.
        // Keep proxy lookup off: inside Flatpak, GLib otherwise asks the
        // ProxyResolver portal, which rejects this loopback-only request when
        // the app has no general network permission.
        let network_session = webkit6::NetworkSession::default()
            .expect("WebKit must provide a default network session");
        network_session.set_proxy_settings(webkit6::NetworkProxyMode::NoProxy, None);
        let web_view = WebView::builder()
            .user_content_manager(&content_manager)
            .web_context(&web_context)
            .network_session(&network_session)
            .build();
        web_view.connect_load_failed(|_, _, uri, error| {
            eprintln!("Could not load Grad Notes page {uri}: {error}");
            false
        });
        connect_native_backend(&content_manager, &web_view, &backend);
        let header_bar = HeaderBar::new();
        header_bar.add_css_class("grad-notes-header");
        header_bar.set_show_start_title_buttons(true);
        header_bar.set_show_end_title_buttons(true);
        header_bar.set_title_widget(Some(&WindowTitle::new("Grad Notes", "")));
        let header_style = adw::gtk::CssProvider::new();
        let sidebar_style = adw::gtk::CssProvider::new();
        sidebar_style.load_from_string(
            ".navigation-sidebar row { padding-top: 0; padding-bottom: 0; min-height: 0; }\
             button.grad-notes-nav-button { min-height: 40px; padding: 6px; }\
             button.grad-notes-home-button { padding: 8px 12px; }\
             button.grad-notes-sidebar-item { padding-top: 4px; padding-bottom: 4px; min-height: 0; }\
             button.grad-notes-tree-disclosure, button.grad-notes-tree-label { padding-left: 0; padding-right: 0; }",
        );
        if let Some(display) = adw::gtk::gdk::Display::default() {
            adw::gtk::style_context_add_provider_for_display(
                &display,
                &header_style,
                adw::gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
            );
            adw::gtk::style_context_add_provider_for_display(
                &display,
                &sidebar_style,
                adw::gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
            );
        }

        // GTK's header bar supplies GNOME's system window buttons. These
        // application actions call the matching existing Svelte actions so
        // the preview keeps the same behavior as the original app.
        let more_actions_button = web_action_button(
            &web_view,
            "view-more-symbolic",
            "More page actions",
            "more",
        );
        more_actions_button.set_visible(false);
        let study_page_button = web_action_button(
            &web_view,
            "view-list-bullet-symbolic",
            "Study flashcards",
            "study",
        );
        study_page_button.set_visible(false);
        for (icon, label, action) in [
            ("go-previous-symbolic", "Back", "back"),
            ("go-next-symbolic", "Forward", "forward"),
        ] {
            header_bar.pack_start(&web_action_button(&web_view, icon, label, action));
        }
        header_bar.pack_start(&web_action_button(
            &web_view,
            "system-search-symbolic",
            "Search",
            "search",
        ));
        for (icon, label, action) in [
            ("view-dual-symbolic", "Split view", "split"),
            ("user-trash-symbolic", "Trash", "trash"),
            ("preferences-system-symbolic", "Settings", "settings"),
            ("view-list-bullet-symbolic", "Study this page", "study"),
            ("view-more-symbolic", "More page actions", "more"),
            ("starred-symbolic", "Toggle favorite", "favorite"),
        ] {
            match action {
                "more" => header_bar.pack_end(&more_actions_button),
                "study" => header_bar.pack_end(&study_page_button),
                _ => header_bar.pack_end(&web_action_button(&web_view, icon, label, action)),
            }
        }

        let native_sidebar = adw::gtk::Box::new(adw::gtk::Orientation::Vertical, 8);
        native_sidebar.add_css_class("navigation-sidebar");
        native_sidebar.set_margin_start(8);
        native_sidebar.set_margin_end(8);
        native_sidebar.set_margin_top(8);
        native_sidebar.set_margin_bottom(8);

        let home_button = adw::gtk::Button::new();
        home_button.add_css_class("grad-notes-nav-button");
        home_button.add_css_class("grad-notes-home-button");
        home_button.set_halign(adw::gtk::Align::Fill);
        let home_contents = adw::gtk::CenterBox::new();
        let home_label = adw::gtk::Label::new(None);
        home_label.set_markup("<span size=\"large\"><b>Grad Notes</b></span>");
        home_label.set_xalign(0.5);
        home_label.set_margin_top(8);
        home_contents.set_center_widget(Some(&home_label));
        let home_icon = adw::gtk::Image::from_icon_name("go-home-symbolic");
        home_icon.set_pixel_size(20);
        home_icon.set_margin_start(4);
        home_contents.set_start_widget(Some(&home_icon));
        home_button.set_child(Some(&home_contents));
        let home_web_view = web_view.clone();
        home_button.connect_clicked(move |_| dispatch_web_action(&home_web_view, "goHome"));
        native_sidebar.append(&home_button);

        let nav_grid = adw::gtk::Grid::new();
        nav_grid.set_column_spacing(6);
        nav_grid.set_row_spacing(6);
        nav_grid.set_column_homogeneous(true);
        let mut nav_buttons = Vec::new();
        for (index, (title, icon, action)) in [
            ("Assignments", "view-list-symbolic", "goAssignments"),
            ("Calendar", "x-office-calendar-symbolic", "goCalendar"),
            ("Files", "folder-symbolic", "goFiles"),
            ("Flashcards", "view-grid-symbolic", "goCards"),
        ]
        .into_iter()
        .enumerate()
        {
            let button = adw::gtk::Button::from_icon_name(icon);
            button.add_css_class("grad-notes-nav-button");
            button.set_tooltip_text(Some(title));
            button.set_size_request(64, 40);
            button.set_hexpand(true);
            let button_web_view = web_view.clone();
            button.connect_clicked(move |_| dispatch_web_action(&button_web_view, action));
            nav_grid.attach(&button, (index % 2) as i32, (index / 2) as i32, 1, 1);
            nav_buttons.push(button);
        }
        native_sidebar.append(&nav_grid);

        let sidebar_content = adw::gtk::Box::new(adw::gtk::Orientation::Vertical, 0);
        sidebar_content.add_css_class("grad-notes-sidebar");
        sidebar_content.append(&native_sidebar);
        sidebar_content.append(&adw::gtk::Separator::new(adw::gtk::Orientation::Horizontal));
        let sidebar_scroll = adw::gtk::ScrolledWindow::new();
        sidebar_scroll.set_vexpand(true);
        sidebar_scroll.set_hexpand(true);
        sidebar_scroll.set_policy(adw::gtk::PolicyType::Never, adw::gtk::PolicyType::Automatic);
        let sidebar_rows = adw::gtk::Box::new(adw::gtk::Orientation::Vertical, 2);
        sidebar_rows.set_margin_top(6);
        sidebar_rows.set_margin_bottom(12);
        sidebar_scroll.set_child(Some(&sidebar_rows));
        sidebar_content.append(&sidebar_scroll);
        let last_sidebar_snapshot = Rc::new(RefCell::new(String::new()));

        // Hide the embedded Svelte sidebar and title bar; the GTK sidebar and
        // header bar use the app's live state through the action bridge.
        web_view.connect_load_changed(|web_view, event| {
            if event == webkit6::LoadEvent::Finished {
                web_view.evaluate_javascript(
                    "JSON.stringify({url:location.href,ready:document.readyState,app:document.querySelector('#app')?.children.length,body:document.body?.innerText?.slice(0,160)})",
                    None,
                    None,
                    None::<&adw::gio::Cancellable>,
                    |result| match result {
                        Ok(value) => eprintln!("Grad Notes web view loaded: {}", value.to_str()),
                        Err(error) => eprintln!("Could not inspect Grad Notes web view: {error}"),
                    },
                );
                web_view.evaluate_javascript(
                    "(() => { document.documentElement.classList.add('grad-notes-gtk'); const style = document.createElement('style'); style.textContent = '.sidebar-slot { display: none !important; } header.titlebar { display: none !important; } .popover, .file-preview-overlay, .lightbox, .table-popover { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; } .scroller > * { animation-duration: 160ms !important; } .panes, .panes.split .scroller, .side { transition-duration: 160ms !important; }'; document.head.append(style); })()",
                    None,
                    None,
                    None::<&adw::gio::Cancellable>,
                    |result| {
                        if let Err(error) = result {
                            eprintln!("Could not apply GTK sidebar layout: {error}");
                        }
                    },
                );
            }
        });

        let window = ApplicationWindow::builder()
            .application(app)
            .title("Grad Notes")
            .default_width(1280)
            .default_height(820)
            .build();

        // WebKitGTK emits this signal for HTML file inputs. Handle it in the
        // host so the app always gets GNOME's native file chooser and returns
        // the selected paths to the page.
        let chooser_parent = window.clone();
        web_view.connect_run_file_chooser(move |_, request| {
            let chooser = adw::gtk::FileDialog::new();
            chooser.set_title("Choose files to import");
            chooser.set_modal(true);
            if let Some(filter) = request.mime_types_filter() {
                let filters = adw::gio::ListStore::new::<adw::gtk::FileFilter>();
                filters.append(&filter);
                chooser.set_filters(Some(&filters));
            }
            let request = request.clone();
            if request.selects_multiple() {
                chooser.open_multiple(
                    Some(&chooser_parent),
                    None::<&adw::gio::Cancellable>,
                    move |result| match result {
                        Ok(files) => respond_file_chooser(&request, files),
                        Err(_) => request.cancel(),
                    },
                );
            } else {
                chooser.open(
                    Some(&chooser_parent),
                    None::<&adw::gio::Cancellable>,
                    move |result| match result {
                        Ok(file) => {
                            let files = adw::gio::ListStore::new::<adw::gio::File>();
                            files.append(&file);
                            respond_file_chooser(&request, files.upcast());
                        }
                        Err(_) => request.cancel(),
                    },
                );
            }
            true
        });

        let split_view = OverlaySplitView::new();
        split_view.set_pin_sidebar(true);
        split_view.set_sidebar_width_fraction(0.22);
        split_view.set_min_sidebar_width(220.0);
        split_view.set_max_sidebar_width(340.0);
        split_view.set_sidebar(Some(&sidebar_content));
        split_view.set_show_sidebar(true);
        let sidebar_toggle = adw::gtk::Button::builder()
            .icon_name("sidebar-show-symbolic")
            .tooltip_text("Toggle sidebar")
            .build();
        let split_view_for_toggle = split_view.clone();
        let sidebar_is_visible = Rc::new(RefCell::new(true));
        let sidebar_visibility = Rc::clone(&sidebar_is_visible);
        sidebar_toggle.connect_clicked(move |_| {
            let show = !*sidebar_visibility.borrow();
            *sidebar_visibility.borrow_mut() = show;
            split_view_for_toggle.set_show_sidebar(show);
        });
        header_bar.pack_start(&sidebar_toggle);
        let content_toolbar = ToolbarView::new();
        content_toolbar.add_top_bar(&header_bar);
        content_toolbar.set_content(Some(&web_view));
        split_view.set_content(Some(&NavigationPage::new(&content_toolbar, "Grad Notes")));

        // The sidebar occupies the full window height and keeps libadwaita's
        // normal GNOME styling.
        let theme_web_view = web_view.clone();
        let theme_style = header_style.clone();
        let last_accent_color = Rc::new(RefCell::new(String::new()));
        let accent_color_cache = Rc::clone(&last_accent_color);
        let last_header_color = Rc::new(RefCell::new(String::new()));
        let header_color_cache = Rc::clone(&last_header_color);
        let sidebar_web_view = web_view.clone();
        let sidebar_rows_refresh = sidebar_rows.clone();
        let sidebar_home_button = home_button.clone();
        let sidebar_nav_buttons = nav_buttons.clone();
        let sidebar_snapshot_cache = last_sidebar_snapshot.clone();
        let more_actions_for_refresh = more_actions_button.clone();
        let study_page_for_refresh = study_page_button.clone();
        adw::glib::timeout_add_local(Duration::from_millis(750), move || {
            update_native_theme(
                &theme_web_view,
                &theme_style,
                &header_color_cache,
                &accent_color_cache,
            );
            refresh_native_sidebar(
                &sidebar_web_view,
                &sidebar_rows_refresh,
                &sidebar_home_button,
                &sidebar_nav_buttons,
                &sidebar_snapshot_cache,
                &more_actions_for_refresh,
                &study_page_for_refresh,
            );
            adw::glib::ControlFlow::Continue
        });

        window.set_content(Some(&split_view));

        // Vite development mode loads the app's existing Tauri API mock, so
        // the screen can render without pretending to be the production app.
        web_view.load_uri(&app_uri);
        window.present();
    });

    app.run();
    if let Some(vite) = vite.as_mut() {
        let _ = vite.kill();
        let _ = vite.wait();
    }
}

fn respond_file_chooser(request: &webkit6::FileChooserRequest, files: adw::gio::ListModel) {
    let paths: Vec<String> = (0..files.n_items())
        .filter_map(|index| files.item(index))
        .filter_map(|item| item.downcast::<adw::gio::File>().ok())
        .filter_map(|file| file.path())
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    let paths: Vec<&str> = paths.iter().map(String::as_str).collect();
    if paths.is_empty() {
        request.cancel();
    } else {
        request.select_files(&paths);
    }
}

fn web_action_button(
    web_view: &WebView,
    icon: &str,
    label: &str,
    action: &'static str,
) -> adw::gtk::Button {
    let button = adw::gtk::Button::builder()
        .icon_name(icon)
        .tooltip_text(label)
        .build();
    let web_view = web_view.clone();
    button.connect_clicked(move |button| {
        if action == "more" {
            let origin = button
                .compute_point(&web_view, &adw::gtk::graphene::Point::new(0.0, 0.0))
                .unwrap_or_else(|| {
                    adw::gtk::graphene::Point::new(web_view.width() as f32 - 8.0, -48.0)
                });
            let detail = serde_json::json!({
                "action": "more",
                "x": origin.x() + button.width() as f32,
                "y": (origin.y() + button.height() as f32 + 6.0).max(8.0),
                "alignRight": true,
            })
            .to_string();
            dispatch_web_detail(&web_view, &detail);
        } else {
            dispatch_web_action(&web_view, action);
        }
    });
    button
}

fn dispatch_web_action(web_view: &WebView, action: &str) {
    dispatch_web_detail(web_view, &serde_json::to_string(action).unwrap_or_default());
}

fn dispatch_web_action_with_id(web_view: &WebView, action: &str, id: &str) {
    let detail = serde_json::json!({ "action": action, "id": id }).to_string();
    dispatch_web_detail(web_view, &detail);
}

fn dispatch_web_detail(web_view: &WebView, detail: &str) {
    let script = format!(
        "(() => {{ const detail = {detail}; if (window.__gradNotesNativeReady) window.dispatchEvent(new CustomEvent('grad-notes-native-action', {{ detail }})); else (window.__gradNotesNativeQueue ??= []).push(detail); }})();"
    );
    web_view.evaluate_javascript(
        &script,
        None,
        None,
        None::<&adw::gio::Cancellable>,
        |result| {
            if let Err(error) = result {
                eprintln!("Could not activate the native GTK action: {error}");
            }
        },
    );
}

fn refresh_native_sidebar(
    web_view: &WebView,
    rows: &adw::gtk::Box,
    home_button: &adw::gtk::Button,
    nav_buttons: &[adw::gtk::Button],
    last_snapshot: &Rc<RefCell<String>>,
    more_actions_button: &adw::gtk::Button,
    study_page_button: &adw::gtk::Button,
) {
    let rows = rows.clone();
    let home_button = home_button.clone();
    let nav_buttons = nav_buttons.to_vec();
    let last_snapshot = Rc::clone(last_snapshot);
    let more_actions_button = more_actions_button.clone();
    let study_page_button = study_page_button.clone();
    let evaluate_view = web_view.clone();
    let action_view = web_view.clone();
    evaluate_view.evaluate_javascript(
        "JSON.stringify(window.__gradNotesNativeSidebarSnapshot?.() ?? null)",
        None,
        None,
        None::<&adw::gio::Cancellable>,
        move |result| {
            let Ok(value) = result else { return };
            let snapshot_text = value.to_str().to_string();
            if snapshot_text == "null" || *last_snapshot.borrow() == snapshot_text {
                return;
            }
            let Ok(snapshot) = serde_json::from_str::<Value>(&snapshot_text) else {
                eprintln!("Could not read the app's native sidebar data");
                return;
            };
            more_actions_button.set_visible(snapshot["hasOpenNote"].as_bool() == Some(true));
            study_page_button.set_visible(snapshot["showStudyAction"].as_bool() == Some(true));
            rebuild_native_sidebar(&rows, &home_button, &nav_buttons, &snapshot, &action_view);
            *last_snapshot.borrow_mut() = snapshot_text;
        },
    );
}

fn rebuild_native_sidebar(
    rows: &adw::gtk::Box,
    home_button: &adw::gtk::Button,
    nav_buttons: &[adw::gtk::Button],
    snapshot: &Value,
    web_view: &WebView,
) {
    while let Some(child) = rows.first_child() {
        rows.remove(&child);
    }

    let sections = &snapshot["sections"];
    append_sidebar_section(
        rows,
        "Favorites",
        "favorites",
        &snapshot["favorites"],
        sections,
        web_view,
    );
    append_sidebar_separator(rows);
    append_sidebar_section(
        rows,
        "Courses",
        "courses",
        &snapshot["courses"],
        sections,
        web_view,
    );
    if let Some(section) = rows.last_child() {
        let add_course = sidebar_button("+ New course", 0);
        let course_web_view = web_view.clone();
        add_course.connect_clicked(move |_| dispatch_web_action(&course_web_view, "newCourse"));
        if let Some(container) = section.downcast_ref::<adw::gtk::Expander>() {
            if let Some(child) = container.child().and_downcast::<adw::gtk::Box>() {
                child.append(&add_course);
            }
        }
    }
    append_sidebar_separator(rows);
    append_sidebar_section(
        rows,
        "Databases",
        "databases",
        &snapshot["databases"],
        sections,
        web_view,
    );
    if let Some(section) = rows.last_child() {
        let add_database = sidebar_button("+ New database", 0);
        let database_web_view = web_view.clone();
        add_database
            .connect_clicked(move |_| dispatch_web_action(&database_web_view, "newDatabase"));
        if let Some(container) = section.downcast_ref::<adw::gtk::Expander>() {
            if let Some(child) = container.child().and_downcast::<adw::gtk::Box>() {
                child.append(&add_database);
            }
        }
    }
    append_sidebar_section(rows, "Tags", "tags", &snapshot["tags"], sections, web_view);
    append_pages_section(rows, sections, &snapshot["roots"], web_view);

    let view = snapshot["view"].as_str().unwrap_or_default();
    set_sidebar_button_active(home_button, view == "home");
    for (button, expected_view) in
        nav_buttons
            .iter()
            .zip(["assignments", "calendar", "files", "cards"])
    {
        set_sidebar_button_active(button, view == expected_view);
    }
}

fn append_sidebar_separator(rows: &adw::gtk::Box) {
    let separator = adw::gtk::Separator::new(adw::gtk::Orientation::Horizontal);
    separator.set_margin_start(12);
    separator.set_margin_end(12);
    separator.set_margin_top(4);
    separator.set_margin_bottom(4);
    rows.append(&separator);
}

fn set_sidebar_button_active(button: &adw::gtk::Button, active: bool) {
    if active {
        button.add_css_class("active");
    } else {
        button.remove_css_class("active");
    }
}

fn append_sidebar_section(
    parent: &adw::gtk::Box,
    title: &str,
    key: &str,
    items: &Value,
    sections: &Value,
    web_view: &WebView,
) {
    let expander = adw::gtk::Expander::new(Some(title));
    expander.set_margin_start(8);
    expander.set_margin_end(8);
    expander.set_expanded(!sections[key].as_bool().unwrap_or(false));
    let content = adw::gtk::Box::new(adw::gtk::Orientation::Vertical, 3);
    if key == "tags" {
        if let Some(items) = items.as_array() {
            for item in items {
                let name = item["name"].as_str().unwrap_or_default();
                let count = item["count"].as_u64().unwrap_or(0);
                append_sidebar_item(
                    &content,
                    &format!("#{name}  ·  {count}"),
                    "openTag",
                    name,
                    item["color"].as_str(),
                    web_view,
                    0,
                );
            }
        }
    } else if let Some(items) = items.as_array() {
        for item in items {
            let id = item["id"].as_str().unwrap_or_default();
            let label = item["title"].as_str().unwrap_or("Untitled");
            let action = match key {
                "favorites" | "databases" => "openPage",
                "courses" => "openCourse",
                _ => "openPage",
            };
            let color = (key == "courses").then(|| item["color"].as_str()).flatten();
            append_sidebar_item(&content, label, action, id, color, web_view, 0);
        }
    }
    let action_web_view = web_view.clone();
    let section_key = key.to_owned();
    let heading = adw::gtk::Label::new(None);
    heading.set_markup(&format!("<b>{title}</b>"));
    heading.set_xalign(0.0);
    heading.set_margin_start(6);
    heading.set_margin_top(4);
    heading.set_margin_bottom(4);
    expander.set_label_widget(Some(&heading));
    expander.connect_notify_local(Some("expanded"), move |_, _| {
        dispatch_web_action_with_id(&action_web_view, "toggleSection", &section_key);
    });
    expander.set_child(Some(&content));
    parent.append(&expander);
}

fn append_pages_section(
    parent: &adw::gtk::Box,
    sections: &Value,
    roots: &Value,
    web_view: &WebView,
) {
    let expander = adw::gtk::Expander::new(Some("Pages"));
    expander.set_margin_start(8);
    expander.set_margin_end(8);
    expander.set_expanded(!sections["pages"].as_bool().unwrap_or(false));
    let content = adw::gtk::Box::new(adw::gtk::Orientation::Vertical, 3);
    if let Some(roots) = roots.as_array() {
        for page in roots {
            append_page_tree(&content, page, web_view, 0);
        }
    }
    let new_page = sidebar_button("+ New page", 0);
    let page_web_view = web_view.clone();
    new_page.connect_clicked(move |_| dispatch_web_action(&page_web_view, "newPage"));
    content.append(&new_page);
    let action_web_view = web_view.clone();
    let heading = adw::gtk::Label::new(None);
    heading.set_markup("<b>Pages</b>");
    heading.set_xalign(0.0);
    heading.set_margin_start(6);
    heading.set_margin_top(4);
    heading.set_margin_bottom(4);
    expander.set_label_widget(Some(&heading));
    expander.connect_notify_local(Some("expanded"), move |_, _| {
        dispatch_web_action_with_id(&action_web_view, "toggleSection", "pages");
    });
    expander.set_child(Some(&content));
    parent.append(&expander);
}

fn append_page_tree(parent: &adw::gtk::Box, page: &Value, web_view: &WebView, depth: i32) {
    let id = page["id"].as_str().unwrap_or_default();
    let title = page["title"].as_str().unwrap_or("Untitled");
    let has_children = page["hasChildren"].as_bool().unwrap_or(false);
    let expanded = page["expanded"].as_bool().unwrap_or(false);
    if has_children {
        let row = adw::gtk::Box::new(adw::gtk::Orientation::Horizontal, 0);
        row.set_margin_start(6 + depth * 14);
        row.set_margin_end(6);
        let disclosure = adw::gtk::Button::from_icon_name(if expanded {
            "pan-down-symbolic"
        } else {
            "pan-end-symbolic"
        });
        disclosure.add_css_class("flat");
        disclosure.add_css_class("grad-notes-sidebar-item");
        disclosure.add_css_class("grad-notes-tree-disclosure");
        disclosure.set_tooltip_text(Some(if expanded { "Collapse" } else { "Expand" }));
        let disclosure_web_view = web_view.clone();
        let page_id = id.to_owned();
        disclosure.connect_clicked(move |_| {
            dispatch_web_action_with_id(&disclosure_web_view, "togglePage", &page_id)
        });
        row.append(&disclosure);
        let open_page = sidebar_button(title, 0);
        open_page.set_margin_start(6);
        open_page.add_css_class("grad-notes-tree-label");
        open_page.set_hexpand(true);
        let open_web_view = web_view.clone();
        let page_id = id.to_owned();
        open_page.connect_clicked(move |_| {
            dispatch_web_action_with_id(&open_web_view, "openPage", &page_id)
        });
        row.append(&open_page);
        append_page_menu_button(&row, web_view, id);
        parent.append(&row);
        if expanded {
            if let Some(children) = page["children"].as_array() {
                for child in children {
                    append_page_tree(parent, child, web_view, depth + 1);
                }
            }
        }
    } else {
        append_sidebar_item(parent, title, "openPage", id, None, web_view, depth);
    }
}

fn append_sidebar_item(
    parent: &adw::gtk::Box,
    label: &str,
    action: &str,
    id: &str,
    color: Option<&str>,
    web_view: &WebView,
    depth: i32,
) {
    if action == "openPage" {
        let row = adw::gtk::Box::new(adw::gtk::Orientation::Horizontal, 0);
        row.set_margin_start(6 + depth * 14);
        row.set_margin_end(6);
        let button = sidebar_button_with_color(label, 0, color);
        button.set_hexpand(true);
        let open_web_view = web_view.clone();
        let open_action = action.to_owned();
        let page_id_for_open = id.to_owned();
        button.connect_clicked(move |_| {
            dispatch_web_action_with_id(&open_web_view, &open_action, &page_id_for_open)
        });
        row.append(&button);
        append_page_menu_button(&row, web_view, id);
        parent.append(&row);
        return;
    }
    let button = sidebar_button_with_color(label, depth, color);
    let web_view = web_view.clone();
    let action = action.to_owned();
    let id = id.to_owned();
    button.connect_clicked(move |_| dispatch_web_action_with_id(&web_view, &action, &id));
    parent.append(&button);
}

fn append_page_menu_button(row: &adw::gtk::Box, web_view: &WebView, id: &str) {
    let button = adw::gtk::Button::from_icon_name("view-more-symbolic");
    button.add_css_class("flat");
    button.add_css_class("grad-notes-sidebar-item");
    button.set_tooltip_text(Some("Page actions"));
    let web_view = web_view.clone();
    let id = id.to_owned();
    button.connect_clicked(move |button| {
        let origin = button
            .compute_point(&web_view, &adw::gtk::graphene::Point::new(0.0, 0.0))
            .unwrap_or_else(|| adw::gtk::graphene::Point::new(0.0, 0.0));
        let detail = serde_json::json!({
            "action": "more",
            "id": id,
            // The menu is drawn inside the WebView, beside the native sidebar.
            "x": 8.0,
            "y": (origin.y() + button.height() as f32 + 6.0).max(8.0),
        })
        .to_string();
        dispatch_web_detail(&web_view, &detail);
    });
    row.append(&button);
}

fn sidebar_button(label: &str, depth: i32) -> adw::gtk::Button {
    sidebar_button_with_color(label, depth, None)
}

fn sidebar_button_with_color(label: &str, depth: i32, color: Option<&str>) -> adw::gtk::Button {
    let button = adw::gtk::Button::new();
    let content = adw::gtk::Box::new(adw::gtk::Orientation::Horizontal, 8);
    let text = adw::gtk::Label::new(Some(label));
    text.set_hexpand(true);
    if let Some(color) = color {
        if let Ok(color) = adw::gtk::gdk::RGBA::parse(color) {
            let dot = adw::gtk::DrawingArea::new();
            dot.set_content_width(8);
            dot.set_content_height(8);
            dot.set_valign(adw::gtk::Align::Center);
            dot.set_draw_func(move |_, context, width, height| {
                context.set_source_rgba(
                    color.red() as f64,
                    color.green() as f64,
                    color.blue() as f64,
                    color.alpha() as f64,
                );
                context.arc(
                    width as f64 / 2.0,
                    height as f64 / 2.0,
                    4.0,
                    0.0,
                    std::f64::consts::TAU,
                );
                let _ = context.fill();
            });
            content.append(&dot);
        }
    }
    text.set_xalign(0.0);
    let attributes = adw::gtk::pango::AttrList::new();
    attributes.insert(adw::gtk::pango::AttrInt::new_weight(
        adw::gtk::pango::Weight::Normal,
    ));
    text.set_attributes(Some(&attributes));
    content.append(&text);
    button.set_child(Some(&content));
    button.set_halign(adw::gtk::Align::Fill);
    button.set_hexpand(true);
    button.set_margin_start(8 + depth * 14);
    button.set_margin_end(6);
    button.set_margin_top(0);
    button.set_margin_bottom(0);
    button.add_css_class("flat");
    button.add_css_class("grad-notes-sidebar-item");
    button
}

fn update_native_theme(
    web_view: &WebView,
    theme_provider: &adw::gtk::CssProvider,
    last_header_color: &Rc<RefCell<String>>,
    last_accent_color: &Rc<RefCell<String>>,
) {
    let theme_provider = theme_provider.clone();
    let last_header_color = Rc::clone(last_header_color);
    let last_accent_color = Rc::clone(last_accent_color);
    web_view.evaluate_javascript(
        "(() => { const pane = document.querySelector('.panes > .scroller'); let paneColor = pane ? getComputedStyle(pane).backgroundColor : ''; if (!paneColor || paneColor === 'rgba(0, 0, 0, 0)') { const main = document.querySelector('.main'); paneColor = getComputedStyle(main || document.body).backgroundColor; } const rootElement = document.documentElement; const root = getComputedStyle(rootElement); return JSON.stringify({ pane: paneColor, accent: root.getPropertyValue('--accent').trim(), text: root.getPropertyValue('--text').trim(), dark: rootElement.dataset.theme === 'dark' }); })()",
        None,
        None,
        None::<&adw::gio::Cancellable>,
        move |result| {
            let Ok(value) = result else { return };
            let Ok(colors) = serde_json::from_str::<Value>(value.to_str().as_str()) else {
                return;
            };
            let Some(pane_color) = colors["pane"].as_str() else {
                return;
            };
            let Some(accent_color) = colors["accent"].as_str() else {
                return;
            };
            let Some(text_color) = colors["text"].as_str() else {
                return;
            };
            let dark_theme = colors["dark"].as_bool() == Some(true);
            let header_changed = *last_header_color.borrow() != pane_color;
            let style_signature = format!("{accent_color}|{text_color}|{dark_theme}");
            let accent_changed = *last_accent_color.borrow() != style_signature;
            if !header_changed && !accent_changed {
                return;
            }
            let css = format!(
                "headerbar.grad-notes-header {{ background-color: {pane_color}; background-image: none; box-shadow: none; color: {text_color}; }}\
                 headerbar.grad-notes-header button {{ color: {text_color}; }}\
                 button.grad-notes-nav-button.active {{ background-color: color-mix(in srgb, {accent_color} 30%, transparent); color: color-mix(in srgb, {accent_color} 65%, {}); }}\
                 button.grad-notes-nav-button.active label {{ color: color-mix(in srgb, {accent_color} 65%, {}); }}",
                if dark_theme { "white" } else { "black" },
                if dark_theme { "white" } else { "black" }
            );
            theme_provider.load_from_bytes(&adw::glib::Bytes::from_owned(css.into_bytes()));
            *last_header_color.borrow_mut() = pane_color.to_owned();
            *last_accent_color.borrow_mut() = style_signature;
        },
    );
}

fn prepare_native_bridge(manager: &UserContentManager, file_base: Option<&str>) {
    manager.register_script_message_handler("gradNotes", None);
    manager.register_script_message_handler("gradNotesDebug", None);
    let file_base = serde_json::to_string(&file_base).unwrap_or_else(|_| "null".into());
    let source = r#"(() => {
      document.documentElement?.classList.add('grad-notes-gtk');
      const pending = new Map();
      let nextId = 1;
      const bridge = {
        invoke(command, args = {}, options = undefined) {
          return new Promise((resolve, reject) => {
            const id = String(nextId++);
            let payloadArgs = args;
            if (args instanceof Uint8Array) payloadArgs = { __gtkBody: Array.from(args) };
            if (options?.headers) {
              payloadArgs = { ...payloadArgs, __gtkHeaders: Object.fromEntries(
                Object.entries(options.headers).map(([key, value]) => [key, decodeURIComponent(String(value))])
              ) };
            }
            pending.set(id, { resolve, reject });
            window.webkit.messageHandlers.gradNotes.postMessage({ id, command, args: payloadArgs });
          });
        },
        resolve(id, ok, value) {
          const call = pending.get(String(id));
          if (!call) return;
          pending.delete(String(id));
          if (ok) call.resolve(value);
          else call.reject(value);
        }
      };
      bridge.fileBase = __GRAD_NOTES_FILE_BASE__;
      window.__GRAD_NOTES_GTK__ = bridge;
      window.__GRAD_NOTES_GTK_HOST__ = true;
      const report = (kind, detail) => {
        try { window.webkit.messageHandlers.gradNotesDebug.postMessage({ kind, detail: String(detail) }); } catch (_) {}
      };
      window.addEventListener('error', event => report('javascript error', `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`));
      window.addEventListener('unhandledrejection', event => report('unhandled promise', event.reason?.stack || event.reason));
      const originalError = console.error.bind(console);
      console.error = (...args) => { originalError(...args); report('console.error', args.map(String).join(' ')); };
    })();"#
    .replace("__GRAD_NOTES_FILE_BASE__", &file_base);
    manager.add_script(&UserScript::new(
        &source,
        UserContentInjectedFrames::TopFrame,
        UserScriptInjectionTime::Start,
        &[],
        &[],
    ));
}

fn serve_dist(
    root: &std::path::Path,
    files_root: &std::path::Path,
    data_dir: &std::path::Path,
) -> io::Result<String> {
    // WebKit stores localStorage by origin, including the port number. A fresh
    // ephemeral port on every launch therefore made the app look like a new
    // install each time, even though its database was still present.
    const PREFERRED_PORT: u16 = 38549;
    let port_file = data_dir.join("webview-port");
    let saved_port = std::fs::read_to_string(&port_file)
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .filter(|port| *port != 0);
    let listener = saved_port
        .and_then(|port| TcpListener::bind(("127.0.0.1", port)).ok())
        .or_else(|| TcpListener::bind(("127.0.0.1", PREFERRED_PORT)).ok())
        .or_else(|| TcpListener::bind(("127.0.0.1", 0)).ok())
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::AddrInUse,
                "could not bind the local app server",
            )
        })?;
    let address = listener.local_addr()?;
    std::fs::write(&port_file, address.port().to_string())?;
    let root = root.to_path_buf();
    let files_root = files_root.to_path_buf();
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let root = root.clone();
            let files_root = files_root.clone();
            thread::spawn(move || serve_dist_request(stream, &root, &files_root));
        }
    });
    Ok(format!("http://{address}/"))
}

fn serve_dist_request(mut stream: TcpStream, root: &std::path::Path, files_root: &std::path::Path) {
    let mut request = [0_u8; 8192];
    let Ok(size) = stream.read(&mut request) else {
        return;
    };
    let request = String::from_utf8_lossy(&request[..size]);
    let Some(line) = request.lines().next() else {
        return;
    };
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let raw_path = parts.next().unwrap_or("/").split('?').next().unwrap_or("/");
    let head = method == "HEAD";
    let relative = percent_decode_path(raw_path.trim_start_matches('/'));
    let serving_file = if let Some(name) = relative.strip_prefix("__tdfile/") {
        grad_notes_backend_core::files::is_valid_name(name).then(|| {
            (
                files_root.join(name),
                grad_notes_backend_core::library::mime_for(name),
            )
        })
    } else {
        let relative = if relative.is_empty() {
            "index.html"
        } else {
            &relative
        };
        let path = std::path::Path::new(relative);
        let safe_path = !path.is_absolute()
            && path
                .components()
                .all(|part| matches!(part, std::path::Component::Normal(_)));
        let mime = match path.extension().and_then(|ext| ext.to_str()).unwrap_or("") {
            "html" => "text/html; charset=utf-8",
            "js" | "mjs" => "text/javascript; charset=utf-8",
            "css" => "text/css; charset=utf-8",
            "json" => "application/json",
            "svg" => "image/svg+xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "woff" => "font/woff",
            "woff2" => "font/woff2",
            "wasm" => "application/wasm",
            _ => "application/octet-stream",
        };
        safe_path.then(|| (root.join(path), mime))
    };
    let file = if matches!(method, "GET" | "HEAD") {
        serving_file.and_then(|(path, mime)| std::fs::read(path).ok().map(|body| (mime, body)))
    } else {
        None
    };
    let (status, mime, body) = match file {
        Some((mime, body)) => ("200 OK", mime, body),
        None => (
            "404 Not Found",
            "text/plain; charset=utf-8",
            b"Not found".to_vec(),
        ),
    };
    let headers = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
        body.len()
    );
    if stream.write_all(headers.as_bytes()).is_ok() && !head {
        let _ = stream.write_all(&body);
    }
}

fn percent_decode_path(path: &str) -> String {
    let mut bytes = Vec::with_capacity(path.len());
    let input = path.as_bytes();
    let mut index = 0;
    while index < input.len() {
        if input[index] == b'%' && index + 2 < input.len() {
            let hex = std::str::from_utf8(&input[index + 1..index + 3]).unwrap_or_default();
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                bytes.push(byte);
                index += 3;
                continue;
            }
        }
        bytes.push(input[index]);
        index += 1;
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn connect_native_backend(
    manager: &UserContentManager,
    web_view: &WebView,
    backend: &Arc<backend::Backend>,
) {
    manager.connect_script_message_received(Some("gradNotesDebug"), |_, message| {
        if let Some(payload) = message.to_json(0) {
            eprintln!("Grad Notes web view: {}", payload.as_str());
        }
    });
    let (responses, receiver) = mpsc::channel::<(Value, Result<Value, String>)>();
    let backend = Arc::clone(backend);
    manager.connect_script_message_received(Some("gradNotes"), move |_, message| {
        let Some(payload) = message.to_json(0) else {
            return;
        };
        let Ok(payload) = serde_json::from_str::<Value>(payload.as_str()) else {
            return;
        };
        let id = payload.get("id").cloned().unwrap_or(Value::Null);
        let command = payload
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let mut args = payload
            .get("args")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));
        if let Some(object) = args.as_object_mut() {
            if let Some(body) = object.remove("__gtkBody") {
                object.insert("bytes".into(), body);
            }
            if let Some(headers) = object.remove("__gtkHeaders") {
                for (header, argument) in [("x-name", "name"), ("x-mime", "mime"), ("x-ext", "ext")]
                {
                    if let Some(value) = headers.get(header) {
                        object.insert(argument.into(), value.clone());
                    }
                }
            }
        }
        let backend = Arc::clone(&backend);
        let responses = responses.clone();
        thread::spawn(move || {
            let result = backend.invoke(&command, args);
            let _ = responses.send((id, result));
        });
    });

    let receiver = Rc::new(RefCell::new(receiver));
    let web_view = web_view.clone();
    adw::glib::timeout_add_local(Duration::from_millis(20), move || {
        loop {
            let response = receiver.borrow_mut().try_recv();
            let Ok((id, result)) = response else { break };
            let (ok, value) = match result {
                Ok(value) => (true, value),
                Err(error) => (false, serde_json::json!(error)),
            };
            let id = serde_json::to_string(&id).unwrap_or_else(|_| "null".into());
            let value = serde_json::to_string(&value).unwrap_or_else(|_| "null".into());
            let script = format!("window.__GRAD_NOTES_GTK__?.resolve({id}, {ok}, {value});");
            web_view.evaluate_javascript(
                &script,
                None,
                None,
                None::<&adw::gio::Cancellable>,
                |_| {},
            );
        }
        adw::glib::ControlFlow::Continue
    });
}

fn start_vite() -> io::Result<Child> {
    if TcpStream::connect(("127.0.0.1", 1420)).is_ok() {
        return Err(io::Error::new(
            io::ErrorKind::AddrInUse,
            "port 1420 is already in use; stop the other Vite preview and try again",
        ));
    }
    let project_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    Command::new("npm")
        .args(["run", "dev", "--", "--host", "127.0.0.1"])
        .current_dir(project_root)
        .spawn()
}

fn wait_for_vite(child: &mut Child) -> io::Result<()> {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        if let Some(status) = child.try_wait()? {
            return Err(io::Error::other(format!(
                "Vite exited before it was ready ({status}); check whether port 1420 is already in use"
            )));
        }
        if vite_serves_page() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "Vite did not become ready within 20 seconds",
            ));
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn vite_serves_page() -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", 1420)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    if stream
        .write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1:1420\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.starts_with("HTTP/1.1 200")
        && response.contains("<div id=\"app\"></div>")
}
