import sys

with open("tests/test_rubric_compatibility.py", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("assert len(files) == 46", "assert len(files) == 47")

with open("tests/test_rubric_compatibility.py", "w", encoding="utf-8") as f:
    f.write(content)
