import os

for root, _, files in os.walk('app'):
    for file in files:
        if file.endswith('.py'):
            with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                content = f.read()
                if 'def get_session(' in content or '@router.get("/{session_id}")' in content:
                    start_idx = content.find('def get_session(')
                    if start_idx == -1:
                        start_idx = content.find('@router.get("/{session_id}")')
                    print("---", file, "---")
                    print(content[max(0, start_idx-200):start_idx+1500])
