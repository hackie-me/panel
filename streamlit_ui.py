import streamlit as st
import json
import os
import subprocess

# JSON file paths
CONFIG_FILE = "config.json"
SYSTEM_CONFIG_FILE = "system.json"

# Utility functions
def load_json(file_path):
    if not os.path.exists(file_path):
        return []
    with open(file_path, 'r') as file:
        return json.load(file)

def save_json(file_path, data):
    with open(file_path, 'w') as file:
        json.dump(data, file, indent=2)

def get_git_path():
    try:
        return subprocess.check_output("where git", shell=True, text=True).strip()
    except subprocess.CalledProcessError:
        st.error("Git is not installed or not found in PATH")
        return None

# Settings screen
def show_settings():
    st.header("Settings")
    
    # Project Folder
    st.subheader("Project Folder")
    folder_path = st.text_input("Set Project Folder", help="Enter or select the project folder")
    if st.button("Save Project Folder"):
        if folder_path:
            config_data = load_json(SYSTEM_CONFIG_FILE)
            config_data["project_folder"] = folder_path
            save_json(SYSTEM_CONFIG_FILE, config_data)
            st.success(f"Project folder set to: {folder_path}")
        else:
            st.warning("Please enter a valid project folder.")

    # Git Path
    st.subheader("Git Path")
    git_path = get_git_path()
    if git_path:
        st.write(f"Detected Git Path: {git_path}")
    if st.button("Save Git Path"):
        if git_path:
            config_data = load_json(SYSTEM_CONFIG_FILE)
            config_data["git_executable"] = git_path
            save_json(SYSTEM_CONFIG_FILE, config_data)
            st.success(f"Git executable path saved: {git_path}")
        else:
            st.warning("Git path not detected.")

    # Backup and Restore Environments
    st.subheader("Backup and Restore Environments")
    if st.button("Backup Environments"):
        try:
            environments = load_json(CONFIG_FILE)
            backup_file = st.text_input("Backup File Name", value="environments_backup.json")
            if st.button("Confirm Backup"):
                save_json(backup_file, environments)
                st.success("Backup completed successfully!")
        except Exception as e:
            st.error(f"Failed to backup environments: {str(e)}")

    uploaded_file = st.file_uploader("Restore Environments from JSON File", type=["json"])
    if uploaded_file:
        try:
            environments = json.load(uploaded_file)
            save_json(CONFIG_FILE, environments)
            st.success("Environments restored successfully!")
        except Exception as e:
            st.error(f"Failed to restore environments: {str(e)}")

# Environment Management
def manage_environments():
    st.header("Manage Environments")
    environments = load_json(CONFIG_FILE)
    env_names = [env['name'] for env in environments]

    # Add New Environment
    st.subheader("Add New Environment")
    env_name = st.text_input("Environment Name")
    env_value = st.text_input("Configuration Value (Encrypted)")
    if st.button("Save Environment"):
        if env_name and env_value:
            environments.append({"name": env_name, "value": env_value})
            save_json(CONFIG_FILE, environments)
            st.success(f"Environment '{env_name}' added successfully!")
        else:
            st.error("All fields are required.")

    # Delete Environment
    st.subheader("Delete Environment")
    selected_env = st.selectbox("Select Environment to Delete", env_names)
    if st.button("Delete Environment"):
        environments = [env for env in environments if env['name'] != selected_env]
        save_json(CONFIG_FILE, environments)
        st.success(f"Environment '{selected_env}' deleted successfully!")

# Run Projects
def run_projects():
    st.header("Run Projects")
    config_data = load_json(SYSTEM_CONFIG_FILE)
    project_folder = config_data.get("project_folder", "")

    if not project_folder:
        st.error("Project folder is not set. Please configure it in Settings.")
        return

    search_term = st.text_input("Search APIs")
    csproj_files = [
        os.path.join(root, file)
        for root, _, files in os.walk(project_folder)
        for file in files if file.endswith("_API.csproj") and search_term.lower() in file.lower()
    ]

    if csproj_files:
        st.write(f"Found {len(csproj_files)} .csproj files.")
        selected_projects = [file for file in csproj_files if st.checkbox(file, key=file)]

        if st.button("Run Selected Projects"):
            for project in selected_projects:
                try:
                    subprocess.Popen(['start', 'cmd', '/K', f'dotnet run --project {project}'], shell=True)
                    st.success(f"Running: {project}")
                except Exception as e:
                    st.error(f"Failed to run project {project}: {e}")
    else:
        st.info("No matching .csproj files found.")

# Main function
def main():
    st.set_page_config(page_title="Control Panel", layout="wide")
    st.sidebar.title("Navigation")
    menu_choice = st.sidebar.radio("Menu", [
        "Dashboard", 
        "Run Projects",
        "Manage Environments", 
        "Settings", 
    ])

    if menu_choice == "Dashboard":
        st.title("Welcome to the Control Panel")
        st.markdown("Use the sidebar to navigate between different sections.")
    elif menu_choice == "Settings":
        show_settings()
    elif menu_choice == "Manage Environments":
        manage_environments()
    elif menu_choice == "Run Projects":
        run_projects()

if __name__ == "__main__":
    main()