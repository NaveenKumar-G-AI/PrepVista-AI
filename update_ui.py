import re

with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to replace the old buttons inside the `uiState === 'USER_LISTENING'` condition
button_replacements = """
                    {assistanceEnabled ? (
                      <>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current || activeAssistance?.mode === 'hint'}
                          onClick={() => requestAssistance('hint')}
                          aria-label="Get Hint"
                        >
                          {assistanceLoading && !activeAssistance ? 'Preparing...' : '💡 Hint'}
                        </button>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current || activeAssistance?.mode === 'guided_approach'}
                          onClick={() => requestAssistance('guided_approach')}
                          aria-label="Guided Approach"
                        >
                          {assistanceLoading && !activeAssistance ? 'Preparing...' : '🧭 Guided Approach'}
                        </button>
                        <button
                          type="button"
                          className={styles.endButton}
                          style={{ opacity: assistanceLoading ? 0.6 : 1 }}
                          disabled={assistanceLoading || finalizing || !!pendingAnswerRef.current || !!pendingRetryRef.current || activeAssistance?.mode === 'sample_answer'}
                          onClick={() => requestAssistance('sample_answer')}
                          aria-label="Sample Answer"
                        >
                          {assistanceLoading && !activeAssistance ? 'Preparing...' : '📝 Sample Answer'}
                        </button>
                      </>
                    ) : null}
"""

content = re.sub(
    r"\{assistanceEnabled \? \(\s*<>\s*<button.*?onClick=\{requestHint\}.*?</button>\s*<button.*?onClick=\{requestAnswerGuidance\}.*?</button>\s*</>\s*\) : null\}",
    button_replacements.strip(),
    content,
    flags=re.DOTALL
)

# And replace the Guidance Panel JSX
# Wait, let me just find the `{assistanceEnabled && assistancePanelOpen` and replace everything to `} : null}`
panel_regex = re.compile(r"\{\s*assistanceEnabled && assistancePanelOpen && uiState === 'USER_LISTENING'\s*\?\s*\(\s*<div.*?{/\* Hint content \*/}.*?\n\s*\)\s*:\s*null\s*\}", re.DOTALL)

new_panel = """
              {assistanceEnabled && assistancePanelOpen && uiState === 'USER_LISTENING' ? (
                <div
                  style={{
                    margin: '12px 0',
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(59,130,246,0.25)',
                    backgroundColor: 'rgba(59,130,246,0.05)',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(59,130,246,0.8)' }}>
                      INTERVIEW ASSISTANT
                    </span>
                    <span style={{ fontSize: '11px', color: 'rgba(100,116,139,0.8)' }}>
                      {provenanceLabel(assistanceStatus)}
                    </span>
                  </div>

                  {assistanceLoading ? (
                    <div style={{ textAlign: 'center', padding: '12px', color: 'rgba(100,116,139,0.8)' }}>
                      Preparing guidance...
                    </div>
                  ) : null}

                  {assistanceError ? (
                    <div role="alert" style={{ color: 'red', marginTop: '8px' }}>
                      {assistanceError}
                    </div>
                  ) : null}

                  {activeAssistance && !assistanceLoading ? (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>
                        {activeAssistance.mode === 'hint' && 'Hint:'}
                        {activeAssistance.mode === 'guided_approach' && 'Guided Approach:'}
                        {activeAssistance.mode === 'sample_answer' && 'Sample Answer:'}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{activeAssistance.content}</div>
                      
                      {activeAssistance.why_it_works && activeAssistance.why_it_works.length > 0 && (
                        <div style={{ marginTop: '16px', borderTop: '1px solid rgba(59,130,246,0.2)', paddingTop: '12px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: 'rgba(100,116,139,0.8)' }}>Why this works</span>
                          <ul style={{ marginTop: '8px', paddingLeft: '20px', marginBottom: 0 }}>
                            {activeAssistance.why_it_works.map((reason, i) => (
                              <li key={i} style={{ marginBottom: '4px' }}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
"""

content = panel_regex.sub(new_panel.strip(), content)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Replaced UI panel")
