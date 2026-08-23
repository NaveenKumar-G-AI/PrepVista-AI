import re

with open(r'c:\PrepVista-AI\tpodashboard\part5\interview_results_centre.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the C object definition
content = re.sub(r'const C = \{[\s\S]*?\};\n', '', content)
content = re.sub(r'const SERIF = "[^"]+";\n', '', content)

# Color mappings to PrepVista Tailwind dark theme
# ink -> text-white
# inkSoft -> text-slate-400
# paper -> bg-slate-900 or card bg
# paperDim -> bg-white/5
# navy -> text-blue-400
# navyLight -> bg-blue-500/10
# brass -> text-amber-400
# brassDeep -> text-amber-500
# forest -> text-emerald-400
# forestBg -> bg-emerald-500/10
# brick -> text-rose-400
# brickBg -> bg-rose-500/10
# amber -> text-amber-400
# amberBg -> bg-amber-500/10
# slate -> text-slate-400
# slateBg -> bg-white/5
# line -> border-white/10
# lineSoft -> border-white/5
# white -> text-white

# We have stuff like: style={{ color: C.slate, backgroundColor: C.slateBg }}
# Let's replace STATUS_META and RESULT_META
content = content.replace('color: C.slate, bg: C.slateBg', "textClass: 'text-slate-400', bgClass: 'bg-white/5'")
content = content.replace('color: C.navy, bg: C.slateBg', "textClass: 'text-blue-400', bgClass: 'bg-white/5'")
content = content.replace('color: C.amber, bg: C.amberBg', "textClass: 'text-amber-400', bgClass: 'bg-amber-500/10'")
content = content.replace('color: C.forest, bg: C.forestBg', "textClass: 'text-emerald-400', bgClass: 'bg-emerald-500/10'")
content = content.replace('color: C.brick, bg: C.brickBg', "textClass: 'text-rose-400', bgClass: 'bg-rose-500/10'")
content = content.replace('color: C.inkSoft, bg: C.slateBg', "textClass: 'text-slate-400', bgClass: 'bg-white/5'")

# Chip component update
content = content.replace('function Chip({ color, bg, Icon, children }) {', 'function Chip({ textClass, bgClass, Icon, children }) {')
content = content.replace('style={{ color, backgroundColor: bg }}', 'className={inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold  }')
content = content.replace('className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"', '')

# Update calls to Chip
content = content.replace('color={m.color} bg={m.bg}', 'textClass={m.textClass} bgClass={m.bgClass}')

# ResultChip fallback
content = content.replace('style={{ color: C.inkSoft }}', 'className="text-slate-400"')

# SectionLabel
content = content.replace('style={{ color: C.brassDeep }}', 'className="text-amber-500"')

# Card
content = content.replace('style={{ backgroundColor: C.white, border: 1px solid , boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}', 'className={card }')
content = content.replace('className="rounded-xl overflow-hidden"', '') # it's already in card

# Divider
content = content.replace('style={{ height: 1, backgroundColor: C.line }}', 'className="h-px bg-white/10"')

# Metric block
content = content.replace('style={{ color: C.inkSoft }}', 'className="text-slate-400"')
content = content.replace('style={{ color: C.ink }}', 'className="text-white"')

# Table / Rows
content = content.replace('style={{ backgroundColor: C.paperDim }}', 'className="bg-white/5"')
content = content.replace('style={{ borderBottom: 1px solid  }}', 'className="border-b border-white/5"')
content = content.replace('style={{ backgroundColor: C.paper }}', 'className="bg-white/5"') # selected row

# More text colors
content = content.replace('style={{ color: C.slate }}', 'className="text-slate-400"')
content = content.replace('style={{ color: C.forest }}', 'className="text-emerald-400"')
content = content.replace('style={{ color: C.brick }}', 'className="text-rose-400"')
content = content.replace('style={{ color: C.navy }}', 'className="text-blue-400"')
content = content.replace('style={{ color: C.brass }}', 'className="text-amber-400"')
content = content.replace('style={{ color: C.white, backgroundColor: C.navy }}', 'className="text-white bg-blue-600"')
content = content.replace('style={{ color: C.navy, backgroundColor: C.white, border: 1px solid  }}', 'className="text-white bg-white/5 border border-white/10"')
content = content.replace('style={{ fontFamily: SERIF }}', 'className="font-serif"')

# Specific buttons
content = content.replace('style={{ backgroundColor: C.navy, color: C.white }}', 'className="bg-blue-600 text-white"')
content = content.replace('style={{ color: C.navy, border: 1px solid  }}', 'className="text-white border border-white/10"')
content = content.replace('style={{ backgroundColor: C.forest, color: C.white }}', 'className="bg-emerald-600 text-white"')
content = content.replace('style={{ backgroundColor: C.brickBg, color: C.brick }}', 'className="bg-rose-500/10 text-rose-400"')
content = content.replace('style={{ backgroundColor: C.slateBg, color: C.inkSoft }}', 'className="bg-white/5 text-slate-400"')
content = content.replace('style={{ color: C.ink, border: 1px solid  }}', 'className="text-white border border-white/10"')

# Generic cleanup of empty styles
content = re.sub(r'style=\{\{\s*\}\}', '', content)
content = re.sub(r' className=""', '', content)

# Remove Papa Parse for now or keep it? The prompt wants inch-perfect integration. We should probably keep PapaParse but add it to frontend dependencies, or we can use the backend /api/results/import/preview. 
# Wait, the prototype uses PapaParse on the client side. We can keep it since papaparse is usually available or we can install it.
# Let's replace default export
content = content.replace('export default function InterviewOperationsConsole()', 'export default function PlacementInterviewsPage()')

# Add "use client" at top
content = '"use client";\n\n' + content

with open(r'c:\PrepVista-AI\frontend\src\app\org-admin\interviews\page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Translation script complete.")