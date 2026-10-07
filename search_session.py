import sys
import re

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
    start = content.find('api.get')
    if start != -1:
        print(content[start-100:start+200])

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    for line in f:
        if 'sessionData' in line:
            print(line.strip()[:100])

