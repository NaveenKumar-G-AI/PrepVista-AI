with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """    if (!session || !assistanceEnabled || !instance || assistanceBusyRef.current === instance
        || isSubmittingRef.current || pendingRetryRef.current || uiStateRef.current !== 'USER_LISTENING') return;"""

replacement = """    if (!session || !assistanceEnabled || !instance || assistanceBusyRef.current === instance
        || isSubmittingRef.current || pendingRetryRef.current || uiStateRef.current !== 'USER_LISTENING') {
        console.log('ABORTING', {session: !!session, enabled: assistanceEnabled, instance, busy: assistanceBusyRef.current, sub: isSubmittingRef.current, retry: !!pendingRetryRef.current, uiState: uiStateRef.current});
        return;
    }"""

content = content.replace(target, replacement)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
