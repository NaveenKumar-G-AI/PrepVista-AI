with open('frontend/src/lib/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

import re
if 'getInterviewSession' not in content:
    replacement = """  async setupInterview<T = unknown>(formData: FormData) {
    return this.request<T>('/interviews/setup', { method: 'POST', body: formData, isFormData: true, timeoutMs: 60000 });
  }
  async getInterviewSession<T = unknown>(sessionId: string) {
    return this.request<T>(`/interviews/${sessionId}`, { method: 'GET', timeoutMs: 15000 });
  }"""
    content = content.replace("  async setupInterview<T = unknown>(formData: FormData) {\n    return this.request<T>('/interviews/setup', { method: 'POST', body: formData, isFormData: true, timeoutMs: 60000 });\n  }", replacement)
    
    with open('frontend/src/lib/api.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Added getInterviewSession")
