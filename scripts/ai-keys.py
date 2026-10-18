#!/usr/bin/env python3
"""Manage hashed AI read keys; plaintext goes only to a private client file."""
import argparse, hashlib, json, os, re, secrets, subprocess
from pathlib import Path

DEFAULT = Path.home()/'.codex/private/pingme-ai-keys.json'
def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary=path.with_name(path.name+'.tmp-'+secrets.token_hex(6))
    try:
        with os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:
            json.dump(data,f,ensure_ascii=False,indent=2);f.write('\n')
        os.replace(temporary,path)
    finally:
        temporary.unlink(missing_ok=True)

def main():
    import time
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--registry',type=Path,default=DEFAULT)
    commands=p.add_subparsers(dest='command',required=True)
    add=commands.add_parser('add');add.add_argument('--name',required=True)
    scope=add.add_mutually_exclusive_group(required=True);scope.add_argument('--all-projects',action='store_true');scope.add_argument('--project',action='append')
    add.add_argument('--days',type=int,default=90);add.add_argument('--client-config',type=Path,required=True);add.add_argument('--url',default='https://pingme.pm')
    revoke=commands.add_parser('revoke');revoke.add_argument('id')
    commands.add_parser('list');deploy=commands.add_parser('deploy');deploy.add_argument('--wrangler',default=str(Path(__file__).resolve().parent.parent/'node_modules/.bin/wrangler'))
    args=p.parse_args();state=json.loads(args.registry.read_text()) if args.registry.exists() else {'keys':[]}
    if args.command=='add':
        if args.client_config.exists():p.error('Client config already exists; choose a new path to avoid overwriting a key')
        if not 1<=args.days<=3650:p.error('--days must be 1–3650')
        if args.project and any(not re.fullmatch(r'[a-z0-9-]{1,50}',x) for x in args.project):p.error('Invalid project slug')
        if len(state['keys'])>=50:p.error('At most 50 keys; revoke an unused key first')
        value='pm_ai_'+secrets.token_hex(32);key={'id':secrets.token_hex(8),'name':args.name,'hash':hashlib.sha256(value.encode()).hexdigest(),'projects':'*' if args.all_projects else sorted(set(args.project)),'expires_at':int(time.time())+args.days*86400}
        save(args.client_config,{'base_url':args.url,'token':value,'key_id':key['id']})
        state['keys'].append(key);save(args.registry,state)
        print(json.dumps({'id':key['id'],'projects':key['projects'],'expires_at':key['expires_at'],'client_config':str(args.client_config),'next':'Run deploy to activate'},ensure_ascii=False))
    elif args.command=='list':print(json.dumps([{k:v for k,v in x.items() if k!='hash'} for x in state['keys']],ensure_ascii=False,indent=2))
    elif args.command=='revoke':
        remaining=[x for x in state['keys'] if x['id']!=args.id]
        if len(remaining)==len(state['keys']):p.error('Unknown key ID')
        state['keys']=remaining;save(args.registry,state);print('Removed locally. Run deploy to revoke on the server.')
    elif args.command=='deploy':
        if not args.registry.exists():p.error('Registry does not exist; refusing to overwrite server configuration')
        payload={'AI_READ_KEYS':json.dumps([{k:v for k,v in x.items() if k!='name'} for x in state['keys']])}
        subprocess.run([args.wrangler,'secret','bulk'],input=json.dumps(payload),text=True,check=True,cwd=Path(__file__).resolve().parent.parent)

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,subprocess.CalledProcessError) as exc:raise SystemExit(str(exc))
