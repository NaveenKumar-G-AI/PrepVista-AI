import ast
import os
import json

def parse_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    try:
        module = ast.parse(content)
    except:
        return {"error": "syntax error"}
        
    docstring = ast.get_docstring(module)
    classes = []
    functions = []
    
    for node in module.body:
        if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
            functions.append({
                "name": node.name,
                "docstring": ast.get_docstring(node),
                "args": [a.arg for a in node.args.args]
            })
        elif isinstance(node, ast.ClassDef):
            c_doc = ast.get_docstring(node)
            c_methods = []
            for item in node.body:
                if isinstance(item, ast.FunctionDef) or isinstance(item, ast.AsyncFunctionDef):
                    c_methods.append({
                        "name": item.name,
                        "docstring": ast.get_docstring(item)
                    })
            classes.append({
                "name": node.name,
                "docstring": c_doc,
                "methods": c_methods
            })
            
    return {
        "docstring": docstring,
        "classes": classes,
        "functions": functions
    }

def process_dir(directory):
    result = {}
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.py') and file != '__init__.py':
                filepath = os.path.join(root, file)
                relpath = os.path.relpath(filepath, directory)
                result[relpath] = parse_file(filepath)
    return result

data = process_dir('c:\\prepforme\\app')
with open('c:\\prepforme\\scripts\\ast_dump.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2)
print("AST extracted successfully.")
