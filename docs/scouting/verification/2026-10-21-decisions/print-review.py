"""Recheck the retained native-browser PDF, not a physical printer.
Run: python3 docs/scouting/verification/2026-10-21-decisions/print-review.py
Requires pdftotext. Optional first argument selects another same-fixture PDF.
"""
from pathlib import Path
import subprocess,re,json,sys
pdf=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).with_name('brief-print.pdf')
text=subprocess.check_output(['pdftotext','-layout',str(pdf),'-'],text=True)
line=next(x.strip() for x in text.splitlines() if 'Evidence cache:' in x)
assert re.search(r'Evidence cache: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z',line),line
assert '<script>throw "unsafe"</script>' in text
assert 'No decisive evidence' in text and '1 disputed' in text
print(json.dumps({'cacheTime':line,'pages':text.count('\f'),'literalUnsafeTextRetained':True,'unknownAndDisputedEvidencePreserved':True,'physicalPrinter':False},indent=2))
