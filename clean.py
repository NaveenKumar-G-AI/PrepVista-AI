import re

file_path = r'c:\prepforme\frontend\src\app\interview\[id]\page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove clearRecentWarningBannerTimer
content = re.sub(r'\s*function clearRecentWarningBannerTimer\(\) \{[\s\S]*?\}\n', '', content)
content = re.sub(r'\s*function clearRecentWarningBannerTimer\(\) \{[\s\S]*?\}\n', '', content)

# 2. Remove keepRecentWarningBanner
content = re.sub(r'\s*function keepRecentWarningBanner\([\s\S]*?\}\n(?=\s*(?:function|export|\}\n))', '', content)

# 3. Remove resumeListeningFromWarning
content = re.sub(r'\s*function resumeListeningFromWarning\([\s\S]*?\}\n(?=\s*(?:function|export|\}\n))', '', content)

# 4. Remove triggerStrike
content = re.sub(r'\s*function triggerStrike\([\s\S]*?\}\n(?=\s*(?:function|export|\}\n))', '', content)

# 5. Remove setter calls
content = re.sub(r'\s*setWarningReason\(.*?\);', '', content)
content = re.sub(r'\s*setRecentWarningReason\(.*?\);', '', content)
content = re.sub(r'\s*clearRecentWarningBannerTimer\(\);', '', content)
content = re.sub(r'\s*warningResumeSnapshotRef\.current = null;', '', content)
content = re.sub(r'\s*warningVisibleUntilRef\.current = 0;', '', content)
content = re.sub(r'\s*if \(warningResumeTimeoutRef\.current !== null\) \{\s*window\.clearTimeout\(warningResumeTimeoutRef\.current\);\s*warningResumeTimeoutRef\.current = null;\s*\}', '', content)

# 6. Update speak function to remove isWarningMessage
content = content.replace('function speak(text: string, isWarningMessage = false, onEnd?: () => void) {', 'function speak(text: string, onEnd?: () => void) {')
content = content.replace('if (!isWarningMessage && uiStateRef.current !== \'FINISHED\' && uiStateRef.current !== \'TERMINATED\') {', 'if (uiStateRef.current !== \'FINISHED\' && uiStateRef.current !== \'TERMINATED\') {')
content = content.replace('if (!isWarningMessage && text && !text.includes(\'Resuming\')) {', 'if (text && !text.includes(\'Resuming\')) {')
content = content.replace('utterance.rate = isWarningMessage ? 0.91 : 0.9;', 'utterance.rate = 0.9;')
content = content.replace('utterance.pitch = isWarningMessage ? 1.0 : 1.04;', 'utterance.pitch = 1.04;')
content = content.replace('if (index === 0 && !isWarningMessage) {', 'if (index === 0) {')

# Find speak calls that pass false or true for isWarningMessage
content = re.sub(r'speak\(([^,]+),\s*false,\s*([^)]+)\)', r'speak(\1, \2)', content)
content = re.sub(r'speak\(([^,]+),\s*true,\s*([^)]+)\)', r'speak(\1, \2)', content)
content = re.sub(r'speak\(([^,]+),\s*false\)', r'speak(\1)', content)
content = re.sub(r'speak\(([^,]+),\s*true\)', r'speak(\1)', content)

# 7. Remove fullscreen code from useEffect
content = re.sub(r'\s*const handleFullscreenChange = \(\) => \{[\s\S]*?\}\s*;\s*', '', content)
content = content.replace('document.addEventListener(\'fullscreenchange\', handleFullscreenChange);', '')
content = content.replace('document.removeEventListener(\'fullscreenchange\', handleFullscreenChange);', '')

# Remove fullscreen from stopAllMedia
content = re.sub(r'\s*if \(typeof document !== \'undefined\' && document\.fullscreenElement\) \{\s*void document\.exitFullscreen\(\)\.catch\(\(\) => undefined\);\s*\}', '', content)

# Remove fullscreen from useEffect cleanup
content = re.sub(r'\s*if \(document\.fullscreenElement\) \{\s*void document\.exitFullscreen\(\)\.catch\(\(\) => undefined\);\s*\}', '', content)

# Remove fullscreen from initializeHardware
content = re.sub(r'\s*if \(!isBrowserMobile\(\) && !document\.fullscreenElement\) \{\s*try \{\s*await document\.documentElement\.requestFullscreen\(\);\s*\} catch \{\s*stopAllMedia\(\);\s*setStartupError\(\'Fullscreen permission is required to begin the interview\.\'\);\s*return false;\s*\}\s*\}', '', content)

# Also fix the text in preStartOpen
content = content.replace('Fullscreen is mandatory on desktop,\n                and exiting fullscreen causes immediate termination.', '')
content = content.replace('Microphone access and fullscreen are required', 'Microphone access is required')
content = content.replace('Fullscreen is mandatory on desktop, and exiting fullscreen causes immediate termination.', '')

# Remove warnings UI banner
content = re.sub(r'\{warningReason \|\| recentWarningReason \? \([\s\S]*?\) : null\}', '', content)
# Remove warning overlay
content = re.sub(r'\{uiState === \'WARNING\' \? \([\s\S]*?\) : null\}', '', content)

# Remove warningCount reference
content = content.replace('setWarningCount(0);', '')
content = content.replace('warningsRef.current = 0;', '')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Phase 2 complete')
