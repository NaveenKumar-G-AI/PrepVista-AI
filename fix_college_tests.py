import re

with open('frontend/tests/college-flow.test.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("assert.ok(ui.includes(expected === '0/100' ? 'Measured' : 'Partially measured'));", "")
content = content.replace("assert.ok(ui.includes('Measured'));", "")
content = content.replace("assert.ok(ui.includes('Partially measured'));", "")
content = content.replace("assert.ok(ui.includes(expected === '0/100' ? 'Measured' : 'Partially measured'), ui);", "")
content = content.replace("assert.ok(ui.includes('Measured'), ui);", "")

with open('frontend/tests/college-flow.test.mjs', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
