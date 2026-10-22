#!/usr/bin/env python3
"""Read and process PingMe feedback with independent scoped keys."""
import argparse, json, os, re, sys, urllib.error, urllib.parse, urllib.request
from pathlib import Path

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path,default=None)
    subs=parser.add_subparsers(dest='command',required=True)
    subs.add_parser('projects')
    search=subs.add_parser('search')
    for flag in ['project','status','q']:search.add_argument('--'+flag)
    search.add_argument('--since',dest='updated_after');search.add_argument('--page',type=int,default=1);search.add_argument('--limit',type=int,default=20)
    get=subs.add_parser('get');get.add_argument('feedback')
    download=subs.add_parser('download');download.add_argument('attachment');download.add_argument('--output',type=Path,required=True)
    update=subs.add_parser('update',help='Reply and/or change status; explicit operator authorization is required')
    update.add_argument('feedback');update.add_argument('--status',choices=['new','progress','resolved','closed','completed'])
    update.add_argument('--body-file',type=Path);update.add_argument('--revision',type=int,required=True);update.add_argument('--request-id',required=True)
    update.add_argument('--no-email',action='store_true')
    args=parser.parse_args()
    writing=args.command=='update'
    args.config=args.config or Path.home()/('.codex/private/pingme-ai-write.json' if writing else '.codex/private/pingme-ai.json')
    config=json.loads(args.config.read_text()) if args.config.exists() else {}
    token=os.environ.get('PINGME_AI_WRITE_TOKEN' if writing else 'PINGME_AI_TOKEN') or config.get('token','')
    base=os.environ.get('PINGME_URL') or config.get('base_url','https://pingme.pm')
    u=urllib.parse.urlsplit(base)
    if u.username or u.password or u.query or u.fragment or u.path not in ('','/') or not u.hostname or not (u.scheme=='https' or u.scheme=='http' and u.hostname in ('localhost','127.0.0.1','::1')):parser.error('Use an HTTPS origin or a local loopback HTTP origin')
    if not re.fullmatch(r'pm_aiw_[a-f0-9]{64}' if writing else r'pm_ai_[a-f0-9]{64}|pm_aiw_[a-f0-9]{64}',token):parser.error('Missing AI key. Set up the appropriate private config; do not paste secrets into chat.')
    path='/api/ai/projects'
    if args.command=='search':
        params={k:getattr(args,k) for k in ['project','status','q','updated_after','page','limit'] if getattr(args,k) is not None}
        path='/api/ai/feedback?'+urllib.parse.urlencode(params)
    elif args.command in ('get','update'):
        identifier=args.feedback.upper() if args.feedback.lower().startswith('pm') else args.feedback
        if not re.fullmatch(r'PM\d{14}|PM-\d{8}-[A-F0-9]{6}|[a-f0-9-]{36}',identifier):parser.error('Expected feedback number or ID')
        path='/api/ai/feedback/'+identifier
    elif args.command=='download':
        if not re.fullmatch(r'[a-f0-9-]{36}',args.attachment):parser.error('Expected attachment ID from a feedback detail')
        if args.output.exists():parser.error('Output already exists; choose a new filename')
        path='/api/ai/attachments/'+args.attachment
    payload=None
    if writing:
        if args.revision<0:parser.error('--revision must be nonnegative')
        if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}',args.request_id):parser.error('--request-id must contain 16-100 letters, digits, underscores or hyphens')
        payload={'revision':args.revision,'suppress_email':args.no_email}
        if args.status is not None:payload['status']=args.status
        if args.body_file is not None:
            payload['body']=args.body_file.read_text(encoding='utf8').strip()
            if not payload['body']:parser.error('Reply file is empty')
        if 'body' not in payload and 'status' not in payload:parser.error('Provide --status or --body-file')
        path+='/reply'
    opener=urllib.request.build_opener(NoRedirect())
    request=urllib.request.Request(base.rstrip('/')+path,data=json.dumps(payload,ensure_ascii=False).encode('utf8') if writing else None,method='POST' if writing else 'GET',headers={'Authorization':'Bearer '+token,'Accept':'application/json','User-Agent':'PingMe-Skill/2.0',**({'Content-Type':'application/json','Idempotency-Key':args.request_id} if writing else {})})
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
