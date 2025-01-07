import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import json
import os
import subprocess
import threading
from tkinter.scrolledtext import ScrolledText
import datetime

# JSON file path
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

def exclude_migration_folders():
    # Load system configuration to get project folder
    config_data = load_json(SYSTEM_CONFIG_FILE)
    project_folder = config_data.get("project_folder", "")

    if not project_folder:
        messagebox.showerror("Error", "Project folder not set in system.json")
        return

    # Get all CSProj files containing 'Persistence' or 'Seeding' in their names
    csproj_files = [
        os.path.join(root, file)
        for root, dirs, files in os.walk(project_folder)
        for file in files
        if file.endswith(".csproj") and ("Persistence" in file or "Seeding" in file)
    ]
    
    if not csproj_files:
        messagebox.showerror("Error", "No CSProj files containing 'Persistence' found in the project folder or subfolders")
        return

    # Define the migration exclusion ItemGroup template
    migration_exclusion = """<ItemGroup>
  <Compile Remove="Migrations\\**" />
  <EmbeddedResource Remove="Migrations\\**" />
  <None Remove="Migrations\\**" />
</ItemGroup>
"""

    # Iterate over each CSProj file
    for csproj_path in csproj_files:
        try:
            # Read the CSProj file as a text file
            with open(csproj_path, 'r', encoding='utf-8') as file:
                lines = file.readlines()

            # Check if migration exclusion is already in the file
            if any("Migrations\\**" in line for line in lines):
                messagebox.showinfo("Info", f"Migration exclusion already present in {csproj_path}")
                continue

            # Find where to insert the exclusion block (after the last </Project> tag)
            insertion_index = next(
                (i for i, line in enumerate(lines) if "</Project>" in line), None
            )
            
            if insertion_index is None:
                messagebox.showerror("Error", f"Invalid CSProj structure in {csproj_path}")
                continue

            # Insert migration exclusion just before the closing </Project> tag
            lines.insert(insertion_index, migration_exclusion)

            # Write the modified lines back to the CSProj file
            with open(csproj_path, 'w', encoding='utf-8') as file:
                file.writelines(lines)

            messagebox.showinfo("Success", f"Excluded migration folders in {csproj_path}")

        except Exception as e:
            messagebox.showerror("Error", f"An error occurred while modifying {csproj_path}: {str(e)}")

# Update Active Environment logic
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

    # Find all appsettings.Dev.json files in the project folder
    appsettings_files = []
    for root, dirs, files in os.walk(project_folder):
        for file in files:
            if file == "appsettings.Dev.json":
                appsettings_files.append(os.path.join(root, file))

    if not appsettings_files:
        messagebox.showerror("Error", "No appsettings.Dev.json files found in the project folder")
        return

    # Update the content of each appsettings.Dev.json file
    for file_path in appsettings_files:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w') as f:
            json.dump(updated_content, f, indent=2)

    messagebox.showinfo("Success", "Active Environment Updated")

# Delete Environment
def delete_environment(env_name, table, environments):
    environments = [env for env in environments if env['name'] != env_name]
    save_json(CONFIG_FILE, environments)
    messagebox.showinfo("Success", f"Environment '{env_name}' deleted successfully")

def checkout_files(file_type):
    # Load configurations
    config = load_json(SYSTEM_CONFIG_FILE)
    project_folder = config.get("project_folder", "")
    git_executable = config.get("git_executable", "")

    if not project_folder or not git_executable:
        messagebox.showerror("Error", "Project folder or Git executable path not configured")
        return

    if file_type.lower() == "json":
        # Walk through the directories in project_folder to find all git repos
        repos = []
        for root, dirs, files in os.walk(project_folder):
            if ".git" in dirs:  # Check if it's a git repository
                repos.append(root)

        if not repos:
            messagebox.showerror("Error", "No Git repositories found in the specified folder")
            return

        for repo in repos:
            try:
                # Discard all .json files in the repository
                git_command = f'"{git_executable}" checkout -- *.json'
                subprocess.run(git_command, cwd=repo, check=True, shell=True)

                messagebox.showinfo("Success", f".JSON files discarded successfully in {repo}")
            except subprocess.CalledProcessError as e:
                messagebox.showerror("Error", f"Error executing git command in {repo}: {str(e)}")
    if file_type.lower() == "csproj":
        # Walk through the directories in project_folder to find all git repos
        repos = []
        for root, dirs, files in os.walk(project_folder):
            if ".git" in dirs:  # Check if it's a git repository
                repos.append(root)

        if not repos:
            messagebox.showerror("Error", "No Git repositories found in the specified folder")
            return

        for repo in repos:
            try:
                # Discard all .json files in the repository
                git_command = f'"{git_executable}" checkout -- *.csproj'
                subprocess.run(git_command, cwd=repo, check=True, shell=True)

                messagebox.showinfo("Success", f".CSPROJ files discarded successfully in {repo}")
            except subprocess.CalledProcessError as e:
                messagebox.showerror("Error", f"Error executing git command in {repo}: {str(e)}")

# UI Trigger
def checkout_environment_files():
    checkout_files("json")

def checkout_csproj_files():
    checkout_files("csproj")

# Detect Git executable path
def get_git_path():
    try:
        # Use 'where' command on Windows, 'which' on Linux/macOS
        git_path = subprocess.check_output("where git", shell=True, text=True).strip()
        return git_path
    except subprocess.CalledProcessError:
        messagebox.showerror("Error", "Git is not installed or not found in PATH")
        return None

# Select Project Folder
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

# Select Git Path
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
    else:
        messagebox.showinfo("Error", f"msg12 :)")

# Loading screen
def show_loading_screen(frame):
    loading_frame = tk.Frame(frame, bg="#1e1e2f", width=800, height=400)
    loading_frame.place(relx=0.5, rely=0.5, anchor="center")

    tk.Label(
        loading_frame,
        text="Please wait... Executing task...",
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
    loading_frame.destroy()

# Your existing functions
def create_app():
    app = tk.Tk()
    app.title("HK's Control Panel")
    app.geometry("800x400")
    app.config(bg="#2e2e2e")
    
    # Set ttk style for modern theme
    style = ttk.Style()
    style.configure("TButton", font=("Arial", 12), padding=10, relief="flat", background="#4CAF50", foreground="white")
    style.map("TButton", background=[("active", "#45a049")], foreground=[("active", "white")])

    style.configure("TLabel", font=("Arial", 12), background="#2e2e2e", foreground="white")
    style.configure("TCombobox", font=("Arial", 12), padding=5)
    style.configure("TEntry", font=("Arial", 12), padding=5)

    # Welcome page
    def show_welcome_page():
        # Clear previous widgets
        for widget in main_frame.winfo_children():
            widget.destroy()

        # Set up the main frame styling
        main_frame.config(bg="#1e1e2f")  # Darker background for better contrast

        # Add a header label
        tk.Label(
            main_frame,
            text="🌟 Welcome, Admin! 🌟",
            font=("Arial", 32, "bold"),
            bg="#1e1e2f",
            fg="#f5a623"
        ).pack(pady=(50, 20))

        # Add a descriptive subtitle
        tk.Label(
            main_frame,
            text="Everything is under your control today. Let's make it productive!",
            font=("Arial", 16),
            bg="#1e1e2f",
            fg="#dcdcdc",
            wraplength=600,
            justify="center"
        ).pack(pady=(10, 40))

        # Add an action button
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

        # Optional footer text
        tk.Label(
            main_frame,
            text="Manage your tasks efficiently and effortlessly. 🚀",
            font=("Arial", 12),
            bg="#1e1e2f",
            fg="#8e8e8e"
        ).pack(side="bottom", pady=20)

        # Add footer copyright notice
        tk.Label(
            main_frame,
            text="Made with ❤️ by Hardik",
            font=("Arial", 10, "italic"),
            bg="#1e1e2f",
            fg="#ff6f61"
        ).pack(side="bottom", pady=(0, 10))

    # Control Panel Page
    def show_control_panel():
        for widget in main_frame.winfo_children():
            widget.destroy()

        loading_frame, progress_bar = show_loading_screen(main_frame)
        main_frame.after(2000, lambda: hide_loading_screen(loading_frame) or show_control_panel_content())

    def show_control_panel_content():
        environments = load_json(CONFIG_FILE)
        env_names = [env['name'] for env in environments]

        tk.Label(main_frame, text="Select Environment:", font=("Arial", 14), bg="#2e2e2e", fg="white").pack(pady=5)
        env_dropdown = ttk.Combobox(main_frame, values=env_names, state="readonly")
        env_dropdown.pack(pady=5)

        tk.Button(main_frame, text="Update Active Environment", command=lambda: update_active_environment(env_dropdown.get())).pack(pady=10)

        # Add new environment form
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

    # Manage Environments Page
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
        # Clear previous widgets
        for widget in main_frame.winfo_children():
            widget.destroy()

        tk.Label(
            main_frame,
            text="Run Projects",
            font=("Arial", 14),
            bg="#2e2e2e",
            fg="white"
        ).pack(pady=10)

        # Create a frame to hold the canvas and scrollbar
        container_frame = tk.Frame(main_frame, bg="#2e2e2e")
        container_frame.pack(fill="both", expand=True, padx=10, pady=10)

        # Create canvas and scrollbar
        canvas = tk.Canvas(container_frame, bg="#2e2e2e", highlightthickness=0)
        scrollbar = ttk.Scrollbar(container_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = tk.Frame(canvas, bg="#2e2e2e")

        # Configure canvas and scrollbar
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        # Ensure scroll region updates dynamically
        def on_frame_configure(event):
            canvas.configure(scrollregion=canvas.bbox("all"))

        scrollable_frame.bind("<Configure>", on_frame_configure)

        # Display a loading label
        loading_label = tk.Label(
            scrollable_frame,
            text="Loading .csproj files...",
            font=("Arial", 12),
            bg="#2e2e2e",
            fg="white"
        )
        loading_label.pack(pady=10)

        # Dictionary to hold checkboxes
        selected_projects = {}

        # Function to populate checkboxes
        def populate_checkboxes(csproj_files):
            loading_label.destroy()
            for csproj in csproj_files:
                var = tk.BooleanVar()
                chk = tk.Checkbutton(
                    scrollable_frame,
                    text=os.path.basename(csproj),
                    variable=var,
                    bg="#2e2e2e",
                    fg="white",
                    selectcolor="#4CAF50",
                    activebackground="#4CAF50",
                    font=("Arial", 12),
                    anchor="w"
                )
                chk.pack(fill="x", pady=2, anchor="w")
                path_label = tk.Label(
                    scrollable_frame,
                    text=csproj,
                    bg="#2e2e2e",
                    fg="#AAAAAA",
                    font=("Arial", 10, "italic"),
                    anchor="w"
                )
                path_label.pack(fill="x", padx=20, pady=1, anchor="w")
                selected_projects[csproj] = var

        # Background task to fetch .csproj files
        def fetch_csproj_files():
            config_data = load_json(SYSTEM_CONFIG_FILE)
            project_folder = config_data.get("project_folder", "")

            if not project_folder:
                messagebox.showerror("Error", "Project folder is not set. Please configure it.")
                return

            csproj_files = [
                os.path.join(root, file)
                for root, dirs, files in os.walk(project_folder)
                for file in files
                if file.endswith("API.csproj") or file.endswith("Gateway.csproj")
            ]

            if not csproj_files:
                messagebox.showerror("Error", "No valid .csproj files found.")
                return

            # Populate the checkboxes on the main thread
            main_frame.after(0, lambda: populate_checkboxes(csproj_files))

        # Start the background thread
        threading.Thread(target=fetch_csproj_files, daemon=True).start()

        def run_selected_projects():
            # Get selected projects
            selected = [path for path, var in selected_projects.items() if var.get()]
            if not selected:
                messagebox.showwarning("Warning", "No projects selected.")
                return

            for project in selected:
                # Extract project directory and file name
                project_dir = os.path.dirname(project)
                project_name = os.path.basename(project)

                # Normalize the .csproj path
                csproj_path = os.path.join(project_dir, project_name)

                # Print debugging info
                print(f"Running project: {csproj_path}")
                print(f"Set CWD to: {project_dir}")

                try:
                    # Execute the dotnet command with the correct cwd
                    cmd_command = f'dotnet run --project {csproj_path}'
    
                    # Start the command in a new command prompt
                    subprocess.Popen(['start', 'cmd', '/K', cmd_command], shell=True)
                    # subprocess.Popen(["dotnet", "run", "--project", csproj_path], cwd=project_dir, shell=False)
                    print(f"Executed successfully: {csproj_path}")
                except subprocess.CalledProcessError as e:
                    print(f"Error: {e}")
                    messagebox.showerror("Error", f"Failed to run project: {project_name}")

            messagebox.showinfo("Success", "Selected projects are running.")


        # Add Run button
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
        ).pack(pady=10)



    # Main menu bar
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
    
    app.config(menu=menu_bar)

    # Main content frame
    main_frame = tk.Frame(app, bg="#2e2e2e")
    main_frame.pack(fill="both", expand=True)

    show_welcome_page()

    app.mainloop()

if __name__ == "__main__":
    create_app()
