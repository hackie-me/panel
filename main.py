import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import json
import os
import subprocess

# JSON file path
CONFIG_FILE = "config.json"
SYSTEM_CONFIG_FILE = "system.json"
FILES_FILE = "files.json"

# Load JSON data
def load_json(file_path):
    if not os.path.exists(file_path):
        return []
    with open(file_path, 'r') as file:
        return json.load(file)

def save_json(file_path, data):
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=2)

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

    files = load_json(FILES_FILE)
    for file in files.get("foundFiles"):
        full_path = os.path.join(project_folder, file)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w') as f:
            json.dump(updated_content, f, indent=2)

    messagebox.showinfo("Success", "Active Environment Updated")

# Delete Environment
def delete_environment(env_name, table, environments):
    environments = [env for env in environments if env['name'] != env_name]
    save_json(CONFIG_FILE, environments)
    messagebox.showinfo("Success", f"Environment '{env_name}' deleted successfully")
    # show_manage_environments()

# Checkout files dynamically
def checkout_files(file_type):
    # Load configurations
    config = load_json(SYSTEM_CONFIG_FILE)
    folder_path = config.get("project_folder", "")
    git_executable = config.get("git_executable", "")

    if not folder_path or not git_executable:
        messagebox.showerror("Error", "Project folder or Git executable path not configured")
        return

    git_command = f'"{git_executable}" checkout -- *.{file_type}'
    
    try:
        subprocess.run(git_command, cwd=folder_path, check=True, shell=True)
        messagebox.showinfo("Success", f"{file_type.upper()} files checked out successfully")
    except subprocess.CalledProcessError as e:
        messagebox.showerror("Error", f"Error executing git command: {str(e)}")

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

# Select Project Folder
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

# Application UI
def create_app():
    app = tk.Tk()
    app.title("HK's Control Panel")
    app.geometry("600x400")

    # Welcome page
    def show_welcome_page():
        for widget in main_frame.winfo_children():
            widget.destroy()
        tk.Label(main_frame, text="Welcome, Hardik!", font=("Arial", 24)).pack(pady=20)

    # Control Panel Page
    def show_control_panel():
        for widget in main_frame.winfo_children():
            widget.destroy()

        environments = load_json(CONFIG_FILE)
        env_names = [env['name'] for env in environments]

        tk.Label(main_frame, text="Select Environment:").pack(pady=5)
        env_dropdown = ttk.Combobox(main_frame, values=env_names, state="readonly")
        env_dropdown.pack(pady=5)

        tk.Button(main_frame, text="Update Active Environment", command=lambda: update_active_environment(env_dropdown.get())).pack(pady=10)

        # Add new environment form
        tk.Label(main_frame, text="Add New Environment", font=("Arial", 14)).pack(pady=10)

        tk.Label(main_frame, text="Environment Name:").pack()
        env_name_entry = tk.Entry(main_frame)
        env_name_entry.pack(pady=5)

        tk.Label(main_frame, text="Configuration Value (Encrypted):").pack()
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

        tk.Label(main_frame, text="Manage Environments", font=("Arial", 14)).pack(pady=10)

        table_frame = tk.Frame(main_frame)
        table_frame.pack(pady=10, fill="x")

        columns = ("Name", "Action")
        table = ttk.Treeview(table_frame, columns=columns, show="headings")
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

    # Main menu bar
    menu_bar = tk.Menu(app)

    control_panel_menu = tk.Menu(menu_bar, tearoff=0)
    control_panel_menu.add_command(label="Control Panel", command=show_control_panel)
    control_panel_menu.add_separator()
    control_panel_menu.add_command(label="Exit", command=app.quit)

    menu_bar.add_cascade(label="Control Panel", menu=control_panel_menu)

    menu_bar.add_command(label="Manage Environments", command=show_manage_environments)
    menu_bar.add_command(label="Checkout Env.", command=checkout_environment_files)
    menu_bar.add_command(label="Checkout CSPROJ File", command=checkout_csproj_files)
    menu_bar.add_command(label="Set Project Folder", command=select_project_folder)
    menu_bar.add_command(label="Set Git Path", command=select_git_path)
    menu_bar.add_command(label="Exclude", command=lambda: messagebox.showinfo("Info", "Feature under development"))

    app.config(menu=menu_bar)

    # Main content frame
    main_frame = tk.Frame(app)
    main_frame.pack(fill="both", expand=True)

    show_welcome_page()

    app.mainloop()

if __name__ == "__main__":
    create_app()
