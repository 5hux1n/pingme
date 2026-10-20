#!/usr/bin/env python3
"""Read PingMe feedback without browser cookies or administrator credentials."""
import argparse, json, os, re, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path,default=Path.home()/'.codex/private/pingme-ai.json')
    subs=parser.add_subparsers(dest='command',required=True)
    subs.add_parser('projects')
    search=subs.add_parser('search')
    for flag in ['project','status','q']:search.add_argument('--'+flag)
    search.add_argument('--since',dest='updated_after');search.add_argument('--page',type=int,default=1);search.add_argument('--limit',type=int,default=20)
    get=subs.add_parser('get');get.add_argument('feedback')
    download=subs.add_parser('download');download.add_argument('attachment');download.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    config=json.loads(args.config.read_text()) if args.config.exists() else {}
    token=os.environ.get('PINGME_AI_TOKEN') or config.get('token','')
    base=os.environ.get('PINGME_URL') or config.get('base_url','https://pingme.pm')
    u=urllib.parse.urlsplit(base)
    if u.username or u.password or u.query or u.fragment or u.path not in ('','/') or not u.hostname or not (u.scheme=='https' or u.scheme=='http' and u.hostname in ('localhost','127.0.0.1','::1')):parser.error('Use an HTTPS origin or a local loopback HTTP origin')
    if not re.fullmatch(r'pm_ai_[a-f0-9]{64}',token):parser.error('Missing AI read key. Set up the private config or PINGME_AI_TOKEN; do not paste secrets into chat.')
    path='/api/ai/projects'
    if args.command=='search':
        params={k:getattr(args,k) for k in ['project','status','q','updated_after','page','limit'] if getattr(args,k) is not None}
        path='/api/ai/feedback?'+urllib.parse.urlencode(params)
    elif args.command=='get':
        identifier=args.feedback.upper() if args.feedback.lower().startswith('pm') else args.feedback
        if not re.fullmatch(r'PM\d{14}|PM-\d{8}-[A-F0-9]{6}|[a-f0-9-]{36}',identifier):parser.error('Expected feedback number or ID')
        path='/api/ai/feedback/'+identifier
    elif args.command=='download':
        if not re.fullmatch(r'[a-f0-9-]{36}',args.attachment):parser.error('Expected attachment ID from a feedback detail')
        if args.output.exists():parser.error('Output already exists; choose a new filename')
        path='/api/ai/attachments/'+args.attachment
    opener=urllib.request.build_opener(NoRedirect())
    request=urllib.request.Request(base.rstrip('/')+path,headers={'Authorization':'Bearer '+token,'Accept':'application/json','User-Agent':'PingMe-Read-Skill/1.0'})
    try:
        with opener.open(request,timeout=30) as response:
            if args.command=='download':
                size=0;created=False
                try:
                    with args.output.open('xb') as output:
                        created=True
                        while chunk:=response.read(65536):
                            size+=len(chunk)
                            if size>10*1024*1024:raise ValueError('Attachment exceeds 10MB')
                            output.write(chunk)
                except BaseException:
                    if created:args.output.unlink(missing_ok=True)
                    raise
                print(json.dumps({'path':str(args.output.resolve()),'bytes':size}));return
            print(json.dumps(json.load(response),ensure_ascii=False,indent=2))
    except urllib.error.HTTPError as exc:
        try:message=json.loads(exc.read(8192)).get('error','Request failed')
        except (ValueError,AttributeError):message='Request failed; redirects are not followed'
        raise SystemExit(f'HTTP {exc.code}: {message}')

if __name__=='__main__':
    try:main()
    except (OSError,ValueError) as exc:raise SystemExit(str(exc))
