"""Turn the vite single-file build into an artifact-ready page (no html/head/body wrappers)."""
import re
s = open('dist-single/index.html').read()
head = re.search(r'<head>(.*?)</head>', s, re.S).group(1); body = re.search(r'<body>(.*?)</body>', s, re.S).group(1)
head = re.sub(r'<meta name="viewport"[^>]*>\s*', '', head)
scripts = re.findall(r'<script[\s\S]*?</script>', head)
for sc in scripts: head = head.replace(sc, '')
open('dist-single/rime.html', 'w').write(head.strip() + '\n' + body.strip() + '\n' + '\n'.join(scripts))
