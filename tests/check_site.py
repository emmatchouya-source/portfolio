"""Check every tracked/new public page and local URL using the GitHub Pages /portfolio/ prefix."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit,unquote,urljoin
import json
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]

class Page(HTMLParser):
    def __init__(self,text):
        super().__init__();self.ids=set();self.duplicates=[];self.links=[];self.h1=0;self.title=False;self.description=False;self.canonical=False;self.og=False;self.feed(text)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'):
            if a['id'] in self.ids:self.duplicates.append(a['id'])
            self.ids.add(a['id'])
        if tag=='h1':self.h1+=1
        if tag=='title':self.title=True
        if tag=='meta' and a.get('name')=='description':self.description=True
        if tag=='meta' and a.get('property')=='og:title':self.og=True
        if tag=='link' and a.get('rel')=='canonical':self.canonical=True
        for attr in ['href','src']:
            if a.get(attr):self.links.append(a[attr])

def main():
    files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
    pages={f:Page((ROOT/f).read_text(encoding='utf-8')) for f in files if f.endswith('.html')}
    failures=[];checked=0
    retained={}
    for name in ['index.html','contact.html','projets/a380-lab/index.html','projets/drone-lab/index.html','projets/aero-optim/index.html']:
        old=Page(subprocess.check_output(['git','show','36b575e:'+name],cwd=ROOT).decode('utf-8'))
        missing=old.ids-pages[name].ids
        if missing:failures.append(f'{name}: previous anchor/control removed: {sorted(missing)}')
        retained[name]=len(old.ids)
    for name,page in pages.items():
        if page.h1!=1 or not all([page.title,page.description,page.canonical,page.og]):failures.append(f'{name}: metadata/headings')
        if page.duplicates:failures.append(f'{name}: duplicate IDs {page.duplicates}')
        for link in page.links:
            if urlsplit(link).scheme or link.startswith('//'):continue
            url=urlsplit(urljoin('https://local.test/portfolio/'+name,link))
            if not url.path.startswith('/portfolio/'):failures.append(f'{name}: path escapes Pages prefix: {link}');continue
            target=unquote(url.path[len('/portfolio/'):]);path=ROOT/target
            if path.is_dir():target=(target.rstrip('/')+'/' if target else '')+'index.html';path=ROOT/target
            if not path.is_file():failures.append(f'{name}: missing {link}');continue
            if url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:failures.append(f'{name}: missing anchor {link}')
            checked+=1
    # Parse every browser module with the actual Node parser, including inline scripts.
    for name in files:
        if name.endswith('.js') or name.endswith('.mjs'):
            r=subprocess.run(['node','--check',name],cwd=ROOT,capture_output=True)
            if r.returncode:failures.append(name+': '+r.stderr.decode(errors='replace'))
    artifact=ROOT/'.test-artifacts';artifact.mkdir(exist_ok=True)
    result={'pages':len(pages),'localUrls':checked,'previousIdsRetained':retained,'failures':failures}
    (artifact/'site-links.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False),flush=True)
    assert not failures,failures

if __name__=='__main__':main()
