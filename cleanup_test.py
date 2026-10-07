with open('frontend/tests/assistance-provenance.test.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("console.log('FETCHING', url); ", "")

with open('frontend/tests/assistance-provenance.test.mjs', 'w', encoding='utf-8') as f:
    f.write(content)
