import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import json
import os
import subprocess
import threading
from tkinter.scrolledtext import ScrolledText
import streamlit as st

# JSON file paths
CONFIG_FILE = "config.json"
SYSTEM_CONFIG_FILE = "system.json"

# Load JSON data
def load_json(file_path):
    if not os.path.exists(file_path):
        return []
    with open(file_path, 'r') as file:
        return json.load(file)

def save_json(file_path, data):
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=2)

# Task to exclude migration folders
def exclude_migration_folders():
    config_data = load_json(SYSTEM_CONFIG_FILE)
    project_folder = config_data.get("project_folder", "")
    if not project_folder:
        messagebox.showerror("Error", "Project folder not set in system.json")
        return

    csproj_files = [
        os.path.join(root, file)
        for root, _, files in os.walk(project_folder)
        for file in files if file.endswith(".csproj") and ("Persistence" in file or "Seeding" in file)
    ]
    if not csproj_files:
        messagebox.showerror("Error", "No CSProj files containing 'Persistence' found in the project folder or subfolders")
        return

    migration_exclusion = """<ItemGroup>
  <Compile Remove="Migrations\\**" />
  <EmbeddedResource Remove="Migrations\\**" />
  <None Remove="Migrations\\**" />
</ItemGroup>
"""
    for csproj_path in csproj_files:
        try:
            with open(csproj_path, 'r', encoding='utf-8') as file:
                lines = file.readlines()

            if any("Migrations\\**" in line for line in lines):
                messagebox.showinfo("Info", f"Migration exclusion already present in {csproj_path}")
                continue

            insertion_index = next((i for i, line in enumerate(lines) if "</Project>" in line), None)
            if insertion_index is None:
                messagebox.showerror("Error", f"Invalid CSProj structure in {csproj_path}")
                continue

            lines.insert(insertion_index, migration_exclusion)

            with open(csproj_path, 'w', encoding='utf-8') as file:
                file.writelines(lines)

            messagebox.showinfo("Success", f"Excluded migration folders in {csproj_path}")
        except Exception as e:
            messagebox.showerror("Error", f"An error occurred while modifying {csproj_path}: {str(e)}")

def update_active_environment(selected_env):
    if not selected_env:
        messagebox.showerror("Error", "Selected environment is required")
        return
    environments = load_json(CONFIG_FILE)
    env = next((env for env in environments if env['name'] == selected_env), None)
    if not env:
        messagebox.showerror("Error", "Environment not found")
        return

    config_data = load_json(SYSTEM_CONFIG_FILE)
    project_folder = config_data.get("project_folder", "")
    if not project_folder:
        messagebox.showerror("Error", "Project folder is not set")
        return

    updated_content = {
        "AppSettings": {
            "AppSettingvalue": env['value']
        },
        "ApplicationInsights": {
            "ConnectionString": ""
        },
        "Logging": {
            "LogLevel": {
                "Default": "Warning",
                "Hangfire": "Information"
            }
        },
        "ApiRateLimiter": {
            "DefaultFixedWindow": 30,
            "DefaultFixedLimit": 5000,
            "HighCapecityFixedWindow": 30,
            "HighCapecityFixedLimit": 10000,
            "DistributedFixedWindow": 60,
            "DistributedFixedLimit": 100,
            "ConcurrencyRateLimit": 500
        },
        "SignalRSetting": {
            "IsEnabled": False
        }
    }

    appsettings_files = []
    for root, _, files in os.walk(project_folder):
        for file in files:
            if file == "appsettings.Dev.json":
                appsettings_files.append(os.path.join(root, file))
    if not appsettings_files:
        messagebox.showerror("Error", "No appsettings.Dev.json files found in the project folder")
        return

    for file_path in appsettings_files:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w') as f:
            json.dump(updated_content, f, indent=2)

    messagebox.showinfo("Success", "Active Environment Updated")

def delete_environment(env_name, table, environments):
    environments = [env for env in environments if env['name'] != env_name]
    save_json(CONFIG_FILE, environments)
    messagebox.showinfo("Success", f"Environment '{env_name}' deleted successfully")

def checkout_files(file_type):
    config = load_json(SYSTEM_CONFIG_FILE)
    project_folder = config.get("project_folder", "")
    git_executable = config.get("git_executable", "")
    if not project_folder or not git_executable:
        messagebox.showerror("Error", "Project folder or Git executable path not configured")
        return

    repos = []
    for root, dirs, _ in os.walk(project_folder):
        if ".git" in dirs:
            repos.append(root)
    if not repos:
        messagebox.showerror("Error", "No Git repositories found in the specified folder")
        return

    git_command = f'"{git_executable}" checkout -- *.{file_type.lower()}'
    for repo in repos:
        try:
            subprocess.run(git_command, cwd=repo, check=True, shell=True)
            messagebox.showinfo("Success", f"{file_type.upper()} files discarded successfully in {repo}")
        except subprocess.CalledProcessError as e:
            messagebox.showerror("Error", f"Error executing git command in {repo}: {str(e)}")

def checkout_environment_files():
    checkout_files("json")

def checkout_csproj_files():
    checkout_files("csproj")

def get_git_path():
    try:
        git_path = subprocess.check_output("where git", shell=True, text=True).strip()
        return git_path
    except subprocess.CalledProcessError:
        messagebox.showerror("Error", "Git is not installed or not found in PATH")
        return None

def select_project_folder():
    folder_path = filedialog.askdirectory(title="Select Project Folder")
    if folder_path:
        config_data = load_json(SYSTEM_CONFIG_FILE)
        if isinstance(config_data, dict):
            config_data["project_folder"] = folder_path
        else:
            config_data = {"project_folder": folder_path}
        save_json(SYSTEM_CONFIG_FILE, config_data)
        messagebox.showinfo("Success", f"Project folder set to: {folder_path}")

def select_git_path():
    git_path = get_git_path()
    if git_path:
        config_data = load_json(SYSTEM_CONFIG_FILE)
        if isinstance(config_data, dict):
            config_data["git_executable"] = git_path
        else:
            config_data = {"git_executable": git_path}
        save_json(SYSTEM_CONFIG_FILE, config_data)
        messagebox.showinfo("Success", f"Git Executable set to: {git_path}")

def show_loading_screen(frame, message="Processing... Please wait."):
    """ Display a loading message while the process runs """
    loading_frame = tk.Frame(frame, bg="#1e1e2f", width=800, height=400)
    loading_frame.place(relx=0.5, rely=0.5, anchor="center")
    tk.Label(
        loading_frame,
        text=message,
        font=("Arial", 14),
        bg="#1e1e2f",
        fg="white"
    ).pack(pady=20)
    progress_bar = ttk.Progressbar(
        loading_frame, mode="indeterminate", length=200
    )
    progress_bar.pack(pady=20)
    progress_bar.start()
    return loading_frame, progress_bar

def hide_loading_screen(loading_frame):
    """ Remove the loading message after processing """
    loading_frame.destroy()

def open_solution(csproj_file):
    base_dir = os.path.dirname(csproj_file)
    solution_file = None
    for root, _, files in os.walk(os.path.dirname(base_dir)):
        for file in files:
            if file.endswith(".sln"):
                solution_file = os.path.join(root, file)
                break
        if solution_file:
            break
    if solution_file:
        try:
            subprocess.run(['start', solution_file], shell=True, check=True)
        except Exception as e:
            messagebox.showerror("Error", f"Could not open solution file: {e}")
    else:
        messagebox.showinfo("Not Found", "No solution file (.sln) found.")

def backup_environments():
    try:
        environments = load_json(CONFIG_FILE)
        backup_file = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON files", "*.json")])
        if backup_file:
            save_json(backup_file, environments)
            messagebox.showinfo("Success", "Backup completed successfully!")
    except Exception as e:
        messagebox.showerror("Error", f"Failed to backup environments: {str(e)}")

def restore_environments():
    try:
        restore_file = filedialog.askopenfilename(filetypes=[("JSON files", "*.json")])
        if restore_file:
            environments = load_json(restore_file)
            save_json(CONFIG_FILE, environments)
            messagebox.showinfo("Success", "Environments restored successfully!")
            show_manage_environments()  # Reload the environments in UI if necessary
    except Exception as e:
        messagebox.showerror("Error", f"Failed to restore environments: {str(e)}")

def create_app():
    app = tk.Tk()
    app.title("HK's Control Panel")
    app.geometry("800x400")
    app.config(bg="#2e2e2e")

    style = ttk.Style()
    style.theme_use('clam')
    style.configure("TButton", font=("Arial", 12), padding=10, relief="flat", background="#4CAF50", foreground="white")
    style.map("TButton", background=[("active", "#45a049")], foreground=[("active", "white")])
    style.configure("TLabel", font=("Arial", 12), background="#2e2e2e", foreground="white")
    style.configure("TEntry", font=("Arial", 12), padding=5)
    style.configure("TCombobox", font=("Arial", 12), padding=5)

    def run_in_background(task_func, *args):
        t = threading.Thread(target=task_func, args=args)
        t.daemon = True
        t.start()

    def show_welcome_page():
        for widget in main_frame.winfo_children():
            widget.destroy()
        main_frame.config(bg="#1e1e2f")
        tk.Label(
            main_frame,
            text="🌟 Welcome, Admin! 🌟",
            font=("Arial", 32, "bold"),
            bg="#1e1e2f",
            fg="#f5a623"
        ).pack(pady=(50, 20))
        tk.Label(
            main_frame,
            text="Everything is under your control today. Let's make it productive!",
            font=("Arial", 16),
            bg="#1e1e2f",
            fg="#dcdcdc",
            wraplength=600,
            justify="center"
        ).pack(pady=(10, 40))
        tk.Button(
            main_frame,
            text="Get Started",
            font=("Arial", 14),
            bg="#f5a623",
            fg="white",
            activebackground="#d48820",
            activeforeground="white",
            relief="flat",
            padx=20,
            pady=10,
            command=show_control_panel
        ).pack()
        tk.Label(
            main_frame,
            text="Manage your tasks efficiently and effortlessly. 🚀",
            font=("Arial", 12),
            bg="#1e1e2f",
            fg="#8e8e8e"
        ).pack(side="bottom", pady=20)
        tk.Label(
            main_frame,
            text="Made with ❤️ by Hardik",
            font=("Arial", 10, "italic"),
            bg="#1e1e2f",
            fg="#ff6f61"
        ).pack(side="bottom", pady=(0, 10))

    def show_control_panel():
        for widget in main_frame.winfo_children():
            widget.destroy()
        loading_frame, _ = show_loading_screen(main_frame)
        main_frame.after(2000, lambda: hide_loading_screen(loading_frame) or show_control_panel_content())

    def show_control_panel_content():
        environments = load_json(CONFIG_FILE)
        env_names = [env['name'] for env in environments]
        tk.Label(main_frame, text="Select Environment:", font=("Arial", 14), bg="#2e2e2e", fg="white").pack(pady=5)
        env_dropdown = ttk.Combobox(main_frame, values=env_names, state="readonly")
        env_dropdown.pack(pady=5)
        tk.Button(main_frame, text="Update Active Environment", command=lambda: update_active_environment(env_dropdown.get())).pack(pady=10)

        tk.Label(main_frame, text="Add New Environment", font=("Arial", 14), bg="#2e2e2e", fg="white").pack(pady=10)
        tk.Label(main_frame, text="Environment Name:", bg="#2e2e2e", fg="white").pack()
        env_name_entry = tk.Entry(main_frame)
        env_name_entry.pack(pady=5)
        tk.Label(main_frame, text="Configuration Value (Encrypted):", bg="#2e2e2e", fg="white").pack()
        env_value_entry = tk.Entry(main_frame)
        env_value_entry.pack(pady=5)

        def save_environment():
            name = env_name_entry.get()
            value = env_value_entry.get()
            if not name or not value:
                messagebox.showerror("Error", "All fields are required")
                return
            environments = load_json(CONFIG_FILE)
            environments.append({"name": name, "value": value})
            save_json(CONFIG_FILE, environments)
            messagebox.showinfo("Success", "Environment added successfully")
            show_control_panel()

        tk.Button(main_frame, text="Save Environment", command=save_environment).pack(pady=10)

    def show_manage_environments():
        for widget in main_frame.winfo_children():
            widget.destroy()
        environments = load_json(CONFIG_FILE)
        tk.Label(main_frame, text="Manage Environments", font=("Arial", 14), bg="#2e2e2e", fg="white").pack(pady=10)
        table_frame = tk.Frame(main_frame)
        table_frame.pack(pady=10, fill="x")
        columns = ("Name", "Action")
        table = ttk.Treeview(table_frame, columns=columns, show="headings", style="Treeview")
        table.heading("Name", text="Environment Name")
        table.heading("Action", text="Action")
        for env in environments:
            table.insert("", "end", values=(env['name'], "Delete"))
        table.pack(fill="x", padx=10)

        def handle_action(event):
            selected_item = table.focus()
            values = table.item(selected_item, "values")
            if values:
                env_name = values[0]
                delete_environment(env_name, table, environments)

        table.bind("<Double-1>", handle_action)

    def show_run_projects_screen():
        for widget in main_frame.winfo_children():
            widget.destroy()
        tk.Label(
            main_frame,
            text="Run Projects",
            font=("Arial", 14),
            bg="#2e2e2e",
            fg="white"
        ).pack(pady=10)

        # Search Box - Top Left Corner
        search_frame = tk.Frame(main_frame, bg="#2e2e2e")
        search_frame.pack(side="top", anchor="nw", padx=10, pady=5)  # Top-left alignment

        search_label = tk.Label(
            search_frame,
            text="Search APIs:",
            font=("Arial", 10),
            bg="#2e2e2e",
            fg="white"
        )
        search_label.pack(side="left", padx=3)

        search_var = tk.StringVar()
        search_entry = tk.Entry(
            search_frame,
            textvariable=search_var,
            font=("Arial", 10)
        )
        search_entry.pack(side="left", padx=4, fill="x", expand=True)
        fetch_button = tk.Button(
            search_frame, text="Fetch Origin", command=lambda: fetch_origin(), 
            font=("Arial", 10), bg="#008CBA", fg="white", padx=10, pady=5
        )
        fetch_button.pack(side="right", padx=5)

        update_button = tk.Button(
            search_frame, text="Update from Develop", command=lambda: update_from_develop(), 
            font=("Arial", 10), bg="#4CAF50", fg="white", padx=10, pady=5
        )
        update_button.pack(side="right", padx=5)

        def fetch_origin():
            selected = [path for path, (var, frame, path_label) in selected_projects.items() if var.get()]
            
            if not selected:
                messagebox.showwarning("Warning", "No projects selected.")
                return
            loading_frame, progress_bar = show_loading_screen(main_frame, "Fetching origin... Please wait.")

            try:
                for project in selected:
                    project_dir = os.path.dirname(project)
                    project_dir = os.path.normpath(project_dir)  # Normalize slashes

                    cmd_command = f'git -C "{project_dir}" fetch origin'
                    subprocess.run(cmd_command, shell=True, check=True)
                    print(f"Fetched origin in: {project_dir}")

                    messagebox.showinfo("Success", "Fetched origin in selected projects.")
        
            except subprocess.CalledProcessError as e:
                print(f"Error: {e}")
                messagebox.showerror("Error", f"Failed to fetch origin.")

            finally:
                hide_loading_screen(loading_frame)

        def update_from_develop():
            selected = [path for path, (var, frame, path_label) in selected_projects.items() if var.get()]
            
            if not selected:
                messagebox.showwarning("Warning", "No projects selected.")
                return
            
            loading_frame, progress_bar = show_loading_screen(main_frame, "Updating from develop... Please wait.")

            try:
                for project in selected:
                    project_dir = os.path.dirname(project)
                    project_dir = os.path.normpath(project_dir)  # Normalize path (fix slashes)
                    try:
                        # Check for uncommitted changes
                        status_command = f'git -C "{project_dir}" status --porcelain'
                        result = subprocess.run(status_command, shell=True, capture_output=True, text=True)

                        if result.stdout.strip():  # If there are uncommitted changes
                            messagebox.showwarning("Warning", f"Uncommitted changes detected in: {project_dir}\nStashing changes before pull.")
                            
                            # Stash local changes to avoid merge conflicts
                            stash_command = f'git -C "{project_dir}" stash push -m "Auto stash before pull"'
                            subprocess.run(stash_command, shell=True, check=True)

                        # Pull latest changes from develop
                        pull_command = f'git -C "{project_dir}" pull origin develop'
                        print(f"Updated from develop in: {project_dir}")
                        subprocess.run(pull_command, shell=True, check=True)

                        # Push the current branch to origin
                        push_command = f'git -C "{project_dir}" push origin'
                        print(f"Pushed changes to origin in: {project_dir}")
                        subprocess.run(push_command, shell=True, check=True)

                        print(f"Updated and pushed in: {project_dir}")

                        # Restore stashed changes if needed
                        unstash_command = f'git -C "{project_dir}" stash pop'
                        subprocess.run(unstash_command, shell=True)
                        
                    except subprocess.CalledProcessError as e:
                        print(f"Error: {e}")
                        messagebox.showerror("Error", f"Failed to update from develop in: {project_dir}")

                messagebox.showinfo("Success", "Updated selected projects from develop.")
            finally:
                    hide_loading_screen(loading_frame)
        def bind_scroll_events(target_widget, canvas):
            if target_widget.winfo_class() == 'Canvas':
                target_widget.bind_all("<MouseWheel>", lambda event: on_mouse_wheel(event, canvas))
                target_widget.bind_all("<Button-4>", lambda event: on_mouse_wheel(event, canvas))  # For Linux
                target_widget.bind_all("<Button-5>", lambda event: on_mouse_wheel(event, canvas))  # For Linux

        def on_mouse_wheel(event, canvas):
            if event.num == 5 or event.delta < 0:
                canvas.yview_scroll(1, "units")
            elif event.num == 4 or event.delta > 0:
                canvas.yview_scroll(-1, "units")

        container_frame = tk.Frame(main_frame, bg="#2e2e2e")
        container_frame.pack(fill="both", expand=True, padx=10, pady=10)
        canvas = tk.Canvas(container_frame, bg="#2e2e2e", highlightthickness=0)
        scrollbar = ttk.Scrollbar(container_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = tk.Frame(canvas, bg="#2e2e2e")
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        bind_scroll_events(canvas, canvas)
        scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        def on_frame_configure(event):
            canvas.configure(scrollregion=canvas.bbox("all"))
        scrollable_frame.bind("<Configure>", on_frame_configure)

        loading_label = tk.Label(
            scrollable_frame,
            text="Loading .csproj files...",
            font=("Arial", 12),
            bg="#2e2e2e",
            fg="white"
        )
        loading_label.pack(pady=10)

        selected_projects = {}

        def populate_checkboxes(csproj_files):
            loading_label.destroy()
            for csproj in csproj_files:
                var = tk.BooleanVar()
                frame = tk.Frame(scrollable_frame, bg="#2e2e2e")
                frame.pack(fill="x", pady=2, anchor="w")
                chk = tk.Checkbutton(
                    frame,
                    text=os.path.basename(csproj),
                    variable=var,
                    bg="#2e2e2e",
                    fg="white",
                    selectcolor="#4CAF50",
                    activebackground="#4CAF50",
                    font=("Arial", 12),
                    anchor="w"
                )
                chk.pack(side="left", fill="x", expand=True)

                btn = tk.Button(
                    frame,
                    text="Open SLN",
                    command=lambda csproj=csproj: open_solution(csproj),
                    bg="#4CAF50",
                    fg="white",
                    font=("Arial", 10),
                    padx=5,
                    pady=2
                )
                btn.pack(side="right", padx=5)

                path_label = tk.Label(
                    scrollable_frame,
                    text=csproj,
                    bg="#2e2e2e",
                    fg="#AAAAAA",
                    font=("Arial", 10, "italic"),
                    anchor="w"
                )
                path_label.pack(fill="x", padx=20, pady=1, anchor="w")

                selected_projects[csproj] = (var, frame,path_label)  # Store var and frame in a tuple

        def filter_csproj():
            search_text = search_var.get().lower()
            for path, (chk_var, frame,path_label) in selected_projects.items():
                file_name = os.path.basename(path).lower()
                full_path = path.lower()
                if search_text in file_name or not search_text:
                    frame.pack(fill="x", pady=2, anchor="w")  # Show matching or all if search box is empty
                    path_label.pack(fill="x", padx=20, pady=1, anchor="w")  # Ensure the path label is visible
                else:
                    frame.pack_forget()  # Hide non-matching entries    
                    path_label.pack_forget()

        search_entry.bind('<KeyRelease>', lambda event: filter_csproj())

        def fetch_csproj_files():
            config_data = load_json(SYSTEM_CONFIG_FILE)
            project_folder = config_data.get("project_folder", "")
            if not project_folder:
                messagebox.showerror("Error", "Project folder is not set. Please configure it.")
                return
            csproj_files = [
                os.path.join(root, file)
                for root, _, files in os.walk(project_folder)
                for file in files if file.endswith("API.csproj") or file.endswith("Gateway.csproj")
            ]
            if not csproj_files:
                messagebox.showerror("Error", "No valid .csproj files found.")
                return
            main_frame.after(0, lambda: populate_checkboxes(csproj_files))

        run_in_background(fetch_csproj_files)

        def run_selected_projects():
            selected = [path for path, (var, frame,path_label) in selected_projects.items() if var.get()]
            if not selected:
                messagebox.showwarning("Warning", "No projects selected.")
                return
            for project in selected:
                project_dir = os.path.dirname(project)
                project_name = os.path.basename(project)
                csproj_path = os.path.join(project_dir, project_name)
                try:
                    cmd_command = f'dotnet run --project {csproj_path}'
                    subprocess.Popen(['start', 'cmd', '/K', cmd_command], shell=True)
                    print(f"Executed successfully: {csproj_path}")
                except subprocess.CalledProcessError as e:
                    print(f"Error: {e}")
                    messagebox.showerror("Error", f"Failed to run project: {project_name}")
            messagebox.showinfo("Success", "Selected projects are running.")

        tk.Button(
            main_frame,
            text="Start",
            command=run_selected_projects,
            font=("Arial", 12),
            bg="#4CAF50",
            fg="white",
            activebackground="#45a049",
            activeforeground="white",
            relief="flat",
            padx=20,
            pady=10
        ).pack(pady=5, side="right", padx=5)

        def uncheck_all():
            for var, frame,path_label in selected_projects.values():
                var.set(False)

        tk.Button(
            main_frame, 
            text="Uncheck All", 
            command=uncheck_all,
            font=("Arial", 12),
            bg="#4CAF50",
            fg="white",
            activebackground="#45a049",
            activeforeground="white",
            relief="flat",
            padx=20,
            pady=10
        ).pack(pady=5, side="right", padx=5)

    menu_bar = tk.Menu(app, bg="#333", fg="white", activebackground="#4CAF50", activeforeground="white")
    control_panel_menu = tk.Menu(menu_bar, tearoff=0, bg="#333", fg="white", activebackground="#4CAF50", activeforeground="white")
    control_panel_menu.add_command(label="Control Panel", command=show_control_panel, background="#333", foreground="white")
    control_panel_menu.add_separator()
    control_panel_menu.add_command(label="Exit", command=app.quit, background="#333", foreground="white")
    menu_bar.add_cascade(label="Control Panel", menu=control_panel_menu)
    menu_bar.add_command(label="Manage Environments", command=show_manage_environments, background="#333", foreground="white")
    menu_bar.add_command(label="Start API", command=show_run_projects_screen, background="#333", foreground="white")
    menu_bar.add_command(label="Checkout Env.", command=checkout_environment_files, background="#333", foreground="white")
    menu_bar.add_command(label="Checkout CSPROJ File", command=checkout_csproj_files, background="#333", foreground="white")
    menu_bar.add_command(label="Exclude Migrations", command=exclude_migration_folders, background="#333", foreground="white")
    menu_bar.add_command(label="Set Project Folder", command=select_project_folder, background="#333", foreground="white")
    menu_bar.add_command(label="Set Git Path", command=select_git_path, background="#333", foreground="white")
    menu_bar.add_command(label="Backup Environments", command=backup_environments, background="#333", foreground="white")
    menu_bar.add_command(label="Restore Environments", command=restore_environments, background="#333", foreground="white")
    app.config(menu=menu_bar)

    main_frame = tk.Frame(app, bg="#2e2e2e")
    main_frame.pack(fill="both", expand=True)
    show_welcome_page()
    # schedule_stretch_reminder()

    app.mainloop()

if __name__ == "__main__":
    create_app()