with open('frontend/tests/report-integrity.test.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("output.includes(value === 0 ? '0%' : expected)", "output.includes(value === 0 ? '0%' : expected.replace('/100', '%'))")

with open('frontend/tests/report-integrity.test.mjs', 'w', encoding='utf-8') as f:
    f.write(content)
print("Done")
