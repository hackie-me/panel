## Prerequisites

List any dependencies and installation instructions here.

- Python 3.x
- PyInstaller
- Other dependencies

### **Install Dependencies**
```bash
pip install json5 
pip install pyinstaller 
pip install tkinter
pip install streamlit
```

## Instructions

### **Configure**

To configure the application, modify the `config.json` and `system.json` files.

- `config.json`: Configuration settings for the application.
- `system.json`: System settings for the application.

### **Run**

To run the application, execute the following command:
```bash
python main.py
streamlit run main.py
```

### **Package**

To package the application, use PyInstaller. First, ensure you have PyInstaller installed:
```bash
pip install pyinstaller
```

Then, run the following command to create a standalone executable:
```bash
pyinstaller --onefile main.py
```

### **Build**

To build the application, run the following command:
python -m PyInstaller --onefile --windowed --add-data "config.json;." --add-data "system.json;." main.py

### **Run**

run the application using:
py FileName.py
