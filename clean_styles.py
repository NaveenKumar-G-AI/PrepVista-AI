import re

with open(r'c:\PrepVista-AI\frontend\src\app\org-admin\interviews\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Just remove all style={{ ... }} entirely to clean up any leftover C. references. 
# Also remove C.xxx in JS logic and SERIF.
content = re.sub(r'style=\{\{[^\}]*\}\}', '', content)
content = content.replace('accent={C.amber}', 'accent="text-amber-400"')
content = content.replace('accent={C.forest}', 'accent="text-emerald-400"')
content = content.replace('accent={C.brick}', 'accent="text-rose-400"')
content = content.replace('accent={openIssues.length ? C.brick : undefined}', 'accent={openIssues.length ? "text-rose-400" : undefined}')
content = content.replace('accent || C.ink', 'accent || "text-white"')

with open(r'c:\PrepVista-AI\frontend\src\app\org-admin\interviews\page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)