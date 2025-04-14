import streamlit as st
import json
import os
import subprocess

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
        st.error("Project folder not set in system.json")
        return

    csproj_files = [
        os.path.join(root, file)
        for root, _, files in os.walk(project_folder)
        for file in files if file.endswith(".csproj") and ("Persistence" in file or "Seeding" in file)
    ]
    if not csproj_files:
        st.error("No CSProj files containing 'Persistence' found in the project folder or subfolders")
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
                st.info(f"Migration exclusion already present in {csproj_path}")
                continue

            insertion_index = next((i for i, line in enumerate(lines) if "</Project>" in line), None)
            if insertion_index is None:
                st.error(f"Invalid CSProj structure in {csproj_path}")
                continue

            lines.insert(insertion_index, migration_exclusion)

            with open(csproj_path, 'w', encoding='utf-8') as file:
                file.writelines(lines)

            st.success(f"Excluded migration folders in {csproj_path}")
        except Exception as e:
            st.error(f"An error occurred while modifying {csproj_path}: {str(e)}")

def update_active_environment(selected_env):
    if not selected_env:
        st.error("Selected environment is required")
        return
    environments = load_json(CONFIG_FILE)
    env = next((env for env in environments if env['name'] == selected_env), None)
    if not env:
        st.error("Environment not found")
        return

    config_data = load_json(SYSTEM_CONFIG_FILE)
    project_folder = config_data.get("project_folder", "")
    if not project_folder:
        st.error("Project folder is not set")
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
        st.error("No appsettings.Dev.json files found in the project folder")
        return

    for file_path in appsettings_files:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w') as f:
            json.dump(updated_content, f, indent=2)

    st.success("Active Environment Updated")

def delete_environment(env_name, environments):
    environments = [env for env in environments if env['name'] != env_name]
    save_json(CONFIG_FILE, environments)
    st.success(f"Environment '{env_name}' deleted successfully")
    return environments # Return the updated environments list

def checkout_files(file_type):
    config = load_json(SYSTEM_CONFIG_FILE)
    project_folder = config.get("project_folder", "")
    git_executable = config.get("git_executable", "")
    if not project_folder or not git_executable:
        st.error("Project folder or Git executable path not configured")
        return

    repos = []
    for root, dirs, _ in os.walk(project_folder):
        if ".git" in dirs:
            repos.append(root)
    if not repos:
        st.error("No Git repositories found in the specified folder")
        return

    git_command = f'"{git_executable}" checkout -- *.{file_type.lower()}'
    for repo in repos:
        try:
            subprocess.run(git_command, cwd=repo, check=True, shell=True)
            st.success(f"{file_type.upper()} files discarded successfully in {repo}")
        except subprocess.CalledProcessError as e:
            st.error(f"Error executing git command in {repo}: {str(e)}")

def checkout_environment_files():
    checkout_files("json")

def checkout_csproj_files():
    checkout_files("csproj")

def get_git_path():
    try:
        git_path = subprocess.check_output("where git", shell=True, text=True).strip()
        return git_path
    except subprocess.CalledProcessError:
        st.error("Git is not installed or not found in PATH")
        return None

def select_project_folder():
    folder_path = st.text_input("Project Folder", help="Enter or select project folder")
    if st.button("Set Project Folder"):
        if folder_path:
            config_data = load_json(SYSTEM_CONFIG_FILE)
            if isinstance(config_data, dict):
                config_data["project_folder"] = folder_path
            else:
                config_data = {"project_folder": folder_path}
            save_json(SYSTEM_CONFIG_FILE, config_data)
            st.success(f"Project folder set to: {folder_path}")
        else:
            st.warning("Please enter or select a project folder.")

def select_git_path():
    git_path = get_git_path()
    if git_path:
        config_data = load_json(SYSTEM_CONFIG_FILE)
        if isinstance(config_data, dict):
            config_data["git_executable"] = git_path
        else:
            config_data = {"git_executable": git_path}
        save_json(SYSTEM_CONFIG_FILE, config_data)
        st.success(f"Git Executable set to: {git_path}")

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
            st.error(f"Could not open solution file: {e}")
    else:
        st.info("No solution file (.sln) found.")

def backup_environments():
    if st.button("Backup Environments"):
        try:
            environments = load_json(CONFIG_FILE)
            backup_file = st.text_input("Backup File Name", value="environments_backup.json")  # Set default name

            if st.button("Confirm Backup"):
                save_json(backup_file, environments)
                st.success("Backup completed successfully!")
        except Exception as e:
            st.error(f"Failed to backup environments: {str(e)}")

def restore_environments():
    uploaded_file = st.file_uploader("Restore Environments from JSON File", type=["json"])

    if uploaded_file is not None:
        try:
            environments = json.load(uploaded_file)  # Load from uploaded file directly
            save_json(CONFIG_FILE, environments)
            st.success("Environments restored successfully!")

        except Exception as e:
            st.error(f"Failed to restore environments: {str(e)}")

def show_control_panel():
    st.header("Control Panel")
    environments = load_json(CONFIG_FILE)
    env_names = [env['name'] for env in environments]
    selected_env = st.selectbox("Select Environment:", options=env_names)

    if st.button("Update Active Environment"):
        update_active_environment(selected_env)

    st.subheader("Add New Environment")
    env_name = st.text_input("Environment Name:")
    env_value = st.text_input("Configuration Value (Encrypted):")

    if st.button("Save Environment"):
        if not env_name or not env_value:
            st.error("All fields are required")
        else:
            environments = load_json(CONFIG_FILE)
            environments.append({"name": env_name, "value": env_value})
            save_json(CONFIG_FILE, environments)
            st.success("Environment added successfully")

    return environments  # Return updated environments for other functions

def show_manage_environments(environments):
    st.header("Manage Environments")
    environment_names = [env['name'] for env in environments]
    selected_env_to_delete = st.selectbox("Select Environment to Delete:", environment_names)

    if st.button("Delete Environment"):
        environments = delete_environment(selected_env_to_delete, environments)  # Delete and update list
        return environments
    return environments  # return the updated environments list

def show_run_projects_screen():
    st.header("Run Projects")

    # Load the system configuration
    config_data = load_json(SYSTEM_CONFIG_FILE)
    project_folder = config_data.get("project_folder", "")

    # Display the project folder
    st.write(f"Current Project Folder: {project_folder}")

    # Search Box
    search_term = st.text_input("Search APIs:", "")

    if not project_folder:
        st.error("Project folder is not set. Please configure it.")
        return

    # Use a function to gather .csproj files in a single step
    def gather_csproj_files(project_folder):
        csproj_files = []
        for root, _, files in os.walk(project_folder):
            for file in files:
                if file.endswith("API.csproj") or file.endswith("Gateway.csproj"):
                    csproj_files.append(os.path.join(root, file))
        return csproj_files

    csproj_files = gather_csproj_files(project_folder)

    # Display .csproj files with checkboxes and Open SLN button
    if csproj_files:
        st.write(f"Found {len(csproj_files)} .csproj files.")
        num_columns = 3  # define the number of columns for .csproj files
        columns = st.columns(num_columns)  # create num_columns number of columns

        selected_projects = []  # accumulate selected .csproj files
        col_idx = 0  # col_idx to track current column index to add the file to

        for csproj in csproj_files:
            # Filter based on the search term
            if search_term.lower() in csproj.lower():
                col = columns[col_idx % num_columns]  # get column to append to

                col.write(os.path.basename(csproj))  # display name

                selected = col.checkbox("", key=csproj)  # key is the path to csproj
                if selected:
                    selected_projects.append(csproj)  # accumulate selected file names

                # Open SLN button
                if col.button("Open SLN", key=f"btn_{csproj}"):
                    open_solution(csproj)
                col_idx += 1  # increment col_idx to ensure the files are equally distributed to each column

        def fetch_origin():
            if not selected_projects:
                st.warning("No projects selected.")
                return

            with st.spinner("Fetching origin... Please wait."):
                for project in selected_projects:
                    project_dir = os.path.dirname(project)
                    project_dir = os.path.normpath(project_dir)  # Normalize slashes

                    try:
                        cmd_command = f'git -C "{project_dir}" fetch origin'
                        subprocess.run(cmd_command, shell=True, check=True)
                        print(f"Fetched origin in: {project_dir}")
                    except subprocess.CalledProcessError as e:
                        print(f"Error: {e}")
                        st.error(f"Failed to fetch origin for {project}: {str(e)}")
                st.success("Fetched origin in selected projects.")

        def update_from_develop():
            if not selected_projects:
                st.warning("No projects selected.")
                return

            with st.spinner("Updating from develop... Please wait."):
                for project in selected_projects:
                    project_dir = os.path.dirname(project)
                    project_dir = os.path.normpath(project_dir)  # Normalize path (fix slashes)
                    try:
                        # Check for uncommitted changes
                        status_command = f'git -C "{project_dir}" status --porcelain'
                        result = subprocess.run(status_command, shell=True, capture_output=True, text=True)

                        if result.stdout.strip():  # If there are uncommitted changes
                            st.warning(f"Uncommitted changes detected in: {project_dir}\nStashing changes before pull.")

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
                        st.error(f"Failed to update from develop for {project}: {str(e)}")

                st.success("Updated selected projects from develop.")

        def run_selected_projects():
            if not selected_projects:
                st.warning("No projects selected.")
                return

            with st.spinner("Running selected projects..."):
                for project in selected_projects:
                    project_dir = os.path.dirname(project)
                    project_name = os.path.basename(project)
                    csproj_path = os.path.join(project_dir, project_name)
                    try:
                        cmd_command = f'dotnet run --project {csproj_path}'
                        subprocess.Popen(['start', 'cmd', '/K', cmd_command], shell=True)
                        print(f"Executed successfully: {csproj_path}")
                    except subprocess.CalledProcessError as e:
                        print(f"Error: {e}")
                        st.error(f"Failed to run project: {project_name}")
                st.success("Selected projects are running.")

        # Start button, Uncheck All button and Fetch Origin button on a single line
        col1, col2, col3 = st.columns(3)
        with col1:
            if st.button("Start"):
                run_selected_projects()

        with col2:
            if st.button("Uncheck All"):
                # Clear all selections
                for key in st.session_state.keys():
                    if key in csproj_files:
                        st.session_state[key] = False
                st.rerun()

        with col3:
            if st.button("Fetch Origin"):
                fetch_origin()

        # Update from Develop button
        if st.button("Update from Develop"):
            update_from_develop()

    else:
        st.info("No valid .csproj files found.")

def main():
    st.set_page_config(page_title="HK's Control Panel", layout="wide")  # Add page title and layout

    st.sidebar.title("Navigation")

    menu_choice = st.sidebar.radio("📋 Navigation", [
        "🏠 Dashboard",
        "🛠️ Control Panel",
        "🌍 Environments",
        "🛠️ Start API", 
        "📂 Checkout Env.",
        "📂 Checkout CSPROJ File",
        "🚫 Exclude Migrations",
        "📁 Set Project Folder",
        "🛠️ Set Git Path",
        "💾 Backup Environments",
        "📥 Restore Environments",
    ])

    if menu_choice == "🏠 Dashboard":
        st.title("🌟 Welcome, Admin! 🌟")
        st.markdown("Everything is under your control today. Let's make it productive!")
        st.info("Everything is under your control today. Let's make it productive!")
        st.markdown("""
        - Manage environment settings
        - Configure your system
        - Run APIs
        - Perform Git operations
        - Handle migrations
        """)
        st.success("Built with ❤️ by Hardik")
    elif menu_choice == "🛠️ Control Panel":
        environments = show_control_panel()
    elif menu_choice == "🌍 Environments":
        environments = load_json(CONFIG_FILE)  # Load the current environments
        environments = show_manage_environments(environments)  # Pass the environments to the function
        save_json(CONFIG_FILE, environments)  # Save the updated environments
    elif menu_choice == "🛠️ Start API":
        show_run_projects_screen()
    elif menu_choice == "📂 Checkout Env.":
        checkout_environment_files()
    elif menu_choice == "📂 Checkout CSPROJ File":
        checkout_csproj_files()
    elif menu_choice == "🚫 Exclude Migrations":
        exclude_migration_folders()
    elif menu_choice == "📁 Set Project Folder":
        select_project_folder()
    elif menu_choice == "🛠️ Set Git Path":
        select_git_path()
    elif menu_choice == "💾 Backup Environments":
        backup_environments()
    elif menu_choice == "📥 Restore Environments":
        restore_environments()

if __name__ == "__main__":
    main()