import os
import json
import re

directories = {
    "frontend": "c:\\prepforme\\frontend\\src",
    "tests": "c:\\prepforme\\tests",
    "scripts": "c:\\prepforme\\scripts"
}

result = {}

def process_dir(name, path):
    result[name] = {}
    for root, _, files in os.walk(path):
        for file in files:
            if file.endswith(('.ts', '.tsx', '.js', '.py')) and not file.startswith('append_chunk') and file != 'ast_extractor.py' and file != 'ast_dump.json':
                filepath = os.path.join(root, file)
                relpath = os.path.relpath(filepath, path)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    
                    # Capture first 15 lines for imports/docstrings
                    head = "".join(lines[:15])
                    
                    # Capture exports/declarations
                    signatures = []
                    for line in lines:
                        if re.match(r'^(export |function |class |interface |const |def |\s*def )', line):
                            signatures.append(line.strip())
                            
                    result[name][relpath] = {
                        "head": head,
                        "signatures": signatures[:30] # Limit to avoid bloat
                    }
                except Exception as e:
                    result[name][relpath] = {"error": str(e)}

for name, path in directories.items():
    process_dir(name, path)

with open('c:\\prepforme\\scripts\\other_dirs_dump.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2)
print("Dump successful.")
