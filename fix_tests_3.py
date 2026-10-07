with open('frontend/tests/report-integrity.test.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("[80, 'PARTIALLY_COMPLETE', 'Partially measured']", "[80, 'PARTIALLY_COMPLETE', '80/100']")
content = content.replace("assert.ok(value === null || output.includes(String(value)), output);", "assert.ok(output.includes(expected), output);")

with open('frontend/tests/report-integrity.test.mjs', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done!")
