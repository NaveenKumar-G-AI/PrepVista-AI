import os

for root, _, files in os.walk('app'):
    for file in files:
        if file.endswith('.py'):
            with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                content = f.read()
                if 'get_session' in content or '@router.get("/{session_id}")' in content:
                    print(file)
