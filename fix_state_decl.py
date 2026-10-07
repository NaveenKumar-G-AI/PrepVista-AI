with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """  const [assistancePanelOpen, setAssistancePanelOpen] = useState(false);
  const [hintContent, setHintContent] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [guidanceContent, setGuidanceContent] = useState<string | null>(null);
  const [guidanceWhyItWorks, setGuidanceWhyItWorks] = useState<string[]>([]);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceError, setAssistanceError] = useState('');"""

replacement = """  const [assistancePanelOpen, setAssistancePanelOpen] = useState(false);
  const [activeAssistance, setActiveAssistance] = useState<{mode: 'hint' | 'guided_approach' | 'sample_answer', content: string, event_id: string, why_it_works?: string[]} | null>(null);
  const [assistanceLoading, setAssistanceLoading] = useState(false);
  const [assistanceError, setAssistanceError] = useState('');"""

content = content.replace(target, replacement)

target2 = """    setHintContent(null);
    setHintLevel(0);
    setGuidanceContent(null);
    setGuidanceWhyItWorks([]);
    setAssistanceLoading(false);"""

replacement2 = """    setActiveAssistance(null);
    setAssistanceLoading(false);"""

content = content.replace(target2, replacement2)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced state declarations")
