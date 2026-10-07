with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    with open('dump.txt', 'w', encoding='utf-8') as out:
        out.write(''.join(lines[2300:2400]))
