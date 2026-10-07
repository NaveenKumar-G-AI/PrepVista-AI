import re

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the state variables
content = re.sub(
    r"const \[hintContent, setHintContent\] = useState<string \| null>\(null\);\s*"
    r"const \[hintLevel, setHintLevel\] = useState\(0\);\s*"
    r"const \[guidanceContent, setGuidanceContent\] = useState<string \| null>\(null\);\s*"
    r"const \[guidanceWhyItWorks, setGuidanceWhyItWorks\] = useState<string\[\]>\(\[\]\);\s*",
    "const [activeAssistance, setActiveAssistance] = useState<{mode: 'hint' | 'guided_approach' | 'sample_answer', content: string, event_id: string, why_it_works?: string[]} | null>(null);\n  ",
    content
)

# And assistanceError is missing entirely?
if "const [assistanceError," not in content:
    # let's add it right after activeAssistance
    content = content.replace("useState<{mode: 'hint' | 'guided_approach' | 'sample_answer', content: string, event_id: string, why_it_works?: string[]} | null>(null);",
                              "useState<{mode: 'hint' | 'guided_approach' | 'sample_answer', content: string, event_id: string, why_it_works?: string[]} | null>(null);\n  const [assistanceError, setAssistanceError] = useState('');")

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Regex replace states done!")
