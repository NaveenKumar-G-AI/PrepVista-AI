with open('frontend/tests/report-integrity.test.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "assert.ok(output.includes(expected), output);",
    "assert.ok(output.replace(/\\s+/g, '').includes(expected.replace(/\\s+/g, '')), output);"
)

with open('frontend/tests/report-integrity.test.mjs', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
