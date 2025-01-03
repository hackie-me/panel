import psutil
import ctypes
import time

# Configuration
TARGET_PROCESS = "Workflow_API.exe"  
DLL_PATH = r"D:\server\panel\dll\DapperSQLLogger.dll"  

# Function to find the target process
def find_process_by_name(name):
    for proc in psutil.process_iter(attrs=["pid", "name"]):
        if proc.info["name"] == name:
            return proc
    return None

# Monitor for the target process
def monitor_process():
    print(f"Looking for {TARGET_PROCESS}...")
    while True:
        proc = find_process_by_name(TARGET_PROCESS)
        if proc:
            print(f"Found process: {proc.info['name']} (PID: {proc.info['pid']})")
            return proc.info['pid']
        time.sleep(5)

# Inject DLL into the target process
def inject_dll(pid, dll_path):
    PROCESS_ALL_ACCESS = 0x1F0FFF
    kernel32 = ctypes.windll.kernel32

    # Open the process
    process_handle = kernel32.OpenProcess(PROCESS_ALL_ACCESS, False, pid)
    if not process_handle:
        print("Failed to open process")
        return False

    # Allocate memory for the DLL path
    dll_path_bytes = dll_path.encode('utf-8')
    dll_path_len = len(dll_path_bytes) + 1
    dll_path_address = kernel32.VirtualAllocEx(
        process_handle, None, dll_path_len, 0x3000, 0x40
    )

    # Write the DLL path to the allocated memory
    kernel32.WriteProcessMemory(process_handle, dll_path_address, dll_path_bytes, dll_path_len, None)

    # Get the address of LoadLibraryA
    load_library_address = kernel32.GetProcAddress(
        kernel32.GetModuleHandleA(b"kernel32.dll"), b"LoadLibraryA"
    )

    # Create a remote thread to load the DLL
    thread_handle = kernel32.CreateRemoteThread(
        process_handle, None, 0, load_library_address, dll_path_address, 0, None
    )

    if not thread_handle:
        print("Failed to create remote thread")
        return False

    print("DLL injected successfully")
    return True

# Monitor the SQL log file for new queries
def monitor_sql_log(log_file="captured_queries.sql"):
    print(f"Monitoring {log_file} for new queries...")
    try:
        with open(log_file, "r") as f:
            f.seek(0, 2)  # Start at the end of the file
            while True:
                line = f.readline()
                if line:
                    print(f"Captured Query: {line.strip()}")
                time.sleep(1)
    except FileNotFoundError:
        print(f"Log file {log_file} not found. Make sure the DLL is logging queries.")

if __name__ == "__main__":
    while True:
        try:
            # Step 1: Monitor the process
            pid = monitor_process()

            # Step 2: Inject the DLL
            if inject_dll(pid, DLL_PATH):
                print(f"Injected DLL into process {TARGET_PROCESS}. Monitoring SQL log...")

            # Step 3: Monitor the SQL log file
            monitor_sql_log()

        except Exception as e:
            print(f"Error occurred: {e}. Retrying in 5 seconds...")
            time.sleep(5)

