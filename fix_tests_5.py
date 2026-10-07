with open('frontend/tests/report-integrity.test.mjs', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# In the history page block:
# test(`actual history page: ${state}`, () => {
#    ...
#    assert.ok(output.includes(expected), output);
# We want it to use expected.replace('/100', '%')

def replacer(match):
    return match.group(0).replace("output.includes(expected)", "output.includes(expected.replace('/100', '%'))")

content = re.sub(r"test\(`actual history page: \$\{state\}`.*?\);", replacer, content, flags=re.DOTALL)

with open('frontend/tests/report-integrity.test.mjs', 'w', encoding='utf-8') as f:
    f.write(content)
print("done")
