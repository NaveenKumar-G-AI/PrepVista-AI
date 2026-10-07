with open('frontend/src/app/interview/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """      setDisplayedAssistance({
        id: resp.event_id,
        instance,
        kind: mode === 'sample_answer' ? 'answer_guidance' : 'hint'
      });
    } catch (err) {"""

replacement = """      console.log('SETTING DISPLAYED ASSISTANCE', resp.event_id, instance, mode);
      setDisplayedAssistance({
        id: resp.event_id,
        instance,
        kind: mode === 'sample_answer' ? 'answer_guidance' : 'hint'
      });
    } catch (err) {
      console.error('CAUGHT ERROR', err);"""

content = content.replace(target, replacement)

with open('frontend/src/app/interview/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
