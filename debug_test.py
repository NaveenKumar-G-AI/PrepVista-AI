with open('frontend/tests/assistance-provenance.test.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("generated++;key=JSON.parse(options.body).client_request_id;", "console.log('FETCHING', url); generated++; key=JSON.parse(options.body).client_request_id;")

with open('frontend/tests/assistance-provenance.test.mjs', 'w', encoding='utf-8') as f:
    f.write(content)
