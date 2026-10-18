"""Real API regression checks. Run only against an isolated, initialized local D1/R2 instance."""
import base64,json,os,sys,time,uuid,urllib.request,urllib.error,urllib.parse
base=os.environ.get('PINGME_TEST_URL','http://localhost:8802').rstrip('/')
assert urllib.parse.urlparse(base).hostname in ('localhost','127.0.0.1'), 'Local isolated test server required'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
cookie='';checks=0;test_ip='192.0.2.'+str(int(uuid.uuid4().hex[:2],16) or 1)

def call(path,method='GET',data=None,expected=200,origin=None,anonymous=False,content_type=None):
 global cookie,checks
 headers={'Origin':origin or base,'cf-connecting-ip':test_ip}
 if not anonymous and cookie:headers['Cookie']=cookie
 if data is not None:
  if isinstance(data,dict):data=json.dumps(data).encode();headers['Content-Type']='application/json'
  else:headers['Content-Type']=content_type
 request=urllib.request.Request(base+'/api'+path,data=data,method=method,headers=headers)
 try:response=opener.open(request,timeout=20)
 except urllib.error.HTTPError as error:response=error
 raw=response.read();assert response.status==expected,(method,path,response.status,raw[:300])
 checks+=1
 if response.headers.get('Set-Cookie') is not None:cookie=response.headers['Set-Cookie'].split(';')[0]
 return json.loads(raw) if response.headers.get('Content-Type','').startswith('application/json') else raw

def multi(fields,files=()):
 boundary='test-'+uuid.uuid4().hex;parts=[]
 for k,v in fields.items():parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n'.encode(),str(v).encode(),b'\r\n'])
 for field,name,mime,raw in files:parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="{name}"\r\nContent-Type: {mime}\r\n\r\n'.encode(),raw,b'\r\n'])
 parts.append(f'--{boundary}--\r\n'.encode());return b''.join(parts),'multipart/form-data; boundary='+boundary

def multipart(path,fields,files=(),expected=200,method='POST',anonymous=False):
 body,ctype=multi(fields,files);return call(path,method,body,expected,content_type=ctype,anonymous=anonymous)

assert call('/admin/me',anonymous=True)=={'authenticated':False}
call('/admin/projects',anonymous=True,expected=401)
call('/admin/login','POST',{'password':'x'},origin='https://elsewhere.test',expected=403)
login=call('/admin/login','POST',{'password':'x'});assert login['snapshot']['ticketTotal']>=64
first=call('/admin/tickets?page=1');second=call('/admin/tickets?page=2');assert len(first['tickets'])==50 and second['tickets'];assert not {t['id'] for t in first['tickets']} & {t['id'] for t in second['tickets']}
print('PASS authentication, CSRF, snapshot, and pagination beyond 50 tickets')
suffix=uuid.uuid4().hex[:8];category='api-'+suffix;slug='test-'+suffix
call('/admin/categories','POST',{'id':category,'name':'API 测试分类','description':'独立开发数据库','sort_order':99})
project={'slug':slug,'name':'API 测试项目','description':'本地测试','official_url':'https://example.com','category':category,'sort_order':9,'homepage_visible':1,'visible':1,'enabled':1,'image_action':'keep'}
call('/admin/projects','POST',project,201);call('/admin/projects','POST',project,409)
fields={'project':slug,'body':'内容'*5000+'描述末尾关键词','email':'private-test@example.test'}
created=multipart('/tickets',fields,[('files','sample.txt','text/plain',b'local attachment')],201,anonymous=True)
public=call(created['url'],anonymous=True);ticket=public['ticket'];id=ticket['id']
assert ticket['body']==fields['body'] and 'contact' not in ticket and ticket['kind']=='feedback';assert ticket['app_version']=='' and ticket['platform']==''
listing=call('/admin/tickets?project='+slug+'&q='+urllib.parse.quote('内容'*20));assert listing['total']==1 and len(listing['tickets'][0]['title'])==81
assert call('/admin/tickets?project='+slug+'&q='+urllib.parse.quote('描述末尾关键词'))['total']==1
short=multipart('/tickets',{'project':slug,'body':'字','email':'private-test@example.test'},expected=201,anonymous=True)
assert call(short['url'],anonymous=True)['ticket']['title']=='字'
multipart('/tickets',dict(fields,email=''),expected=400,anonymous=True)
multipart('/tickets',dict(fields,body=''),expected=400,anonymous=True)
for status in ('progress','resolved','closed','new'):
 saved=call('/admin/tickets/'+id,'PATCH',{'status':status});assert saved['ticket']['status']==status
 assert call('/admin/tickets/'+id)['ticket']['status']==status
call('/admin/tickets/'+id,'PATCH',{'status':'invalid'},400)
call('/admin/tickets/'+id+'/reply','POST',{'body':'内部内容','internal':True})
result=call('/admin/tickets/'+id+'/reply','POST',{'body':'开发者已收到反馈','internal':False,'status':'progress'});assert result['ticket']['status']=='progress';assert any(m['role']=='internal' and m['body']=='内部内容' for m in result['messages']);assert result['messages'][-1]['body'].startswith('开发者已收到反馈')
public=call(created['url'],anonymous=True);assert all(m['role']!='internal' for m in public['messages']);assert public['messages'][-1]['body'].startswith('开发者已收到反馈')
muted=call('/admin/tickets/'+id+'/reply','POST',{'body':'不发邮件的公开答复','status':'resolved','suppress_email':True});assert muted['emailSuppressed'] and not muted['emailQueued']
assert call(created['url'],anonymous=True)['messages'][-1]['body'].startswith('不发邮件的公开答复')
attachment=public['attachments'][0]['id'];token=created['url'].split('/')[-1]
call('/attachments/'+attachment,anonymous=True,expected=403)
assert call('/attachments/'+attachment+'?token='+token,anonymous=True)==b'local attachment'
call('/admin/tickets/'+id,'PATCH',{'status':'closed'})
multipart(created['url']+'/reply',{'body':'补充已关闭反馈的新线索'},anonymous=True)
assert call(created['url'],anonymous=True)['ticket']['status']=='new'
call('/admin/tickets/'+id,'PATCH',{'status':'new'})
print('PASS unrestricted short/long feedback, four persisted statuses, replies, internal visibility, private attachments')
call('/admin/categories/'+category,'DELETE',expected=409)
call('/admin/categories/other','DELETE',expected=400)
project.update(homepage_visible=0,visible=0,enabled=0)
call('/admin/projects/'+slug,'PATCH',project)
assert not any(p['slug']==slug for p in call('/projects',anonymous=True)['projects'])
assert not any(p['slug']==slug for p in call('/catalog',anonymous=True)['projects'])
call('/projects/'+slug,anonymous=True,expected=404)
project.update(homepage_visible=1,visible=1,enabled=1);call('/admin/projects/'+slug,'PATCH',project)
png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=')
image_body={**project,'image_action':'replace','image_version':''}
uploaded=multipart('/admin/projects/'+slug,{'data':json.dumps(image_body)},[('image','pixel.png','image/png',png)],method='PATCH')
old_url=uploaded['image_url'];assert call(old_url[4:],anonymous=True)==png
call('/admin/projects/'+slug,'PATCH',dict(project,image_version='outdated'),409)
current=next(p for p in call('/admin/projects')['projects'] if p['slug']==slug)
call('/admin/projects/'+slug,'PATCH',dict(project,image_action='remove',image_version=current['image_key']))
call(old_url[4:],anonymous=True,expected=404)
empty='empty-'+suffix;call('/admin/categories','POST',{'id':empty,'name':'空分类','description':'','sort_order':100});call('/admin/categories/'+empty,'DELETE')
print('PASS category CRUD/protection, visibility flags, R2 image persistence/removal/version conflict')
about=call('/admin/about');original=json.loads(json.dumps(about));about['personal']['bio']='本地 API 版本检查';saved=call('/admin/about','PUT',about)
call('/admin/about','PUT',original,409);original['version']=saved['version'];call('/admin/about','PUT',original)
old_cookie=cookie
call('/admin/password','POST',{'currentPassword':'x','newPassword':'y','confirmPassword':'y'})
cookie=old_cookie;assert call('/admin/me')['authenticated'] is False
call('/admin/login','POST',{'password':'x'},401)
call('/admin/login','POST',{'password':'y'})
call('/admin/password','POST',{'currentPassword':'y','newPassword':'x','confirmPassword':'x'})
call('/admin/login','POST',{'password':'x'})
receipt=call('/admin/tickets/'+id)['notification'];assert receipt['status']=='disabled'
call('/admin/logout','POST');assert call('/admin/me')['authenticated'] is False
print('PASS about version conflicts, one-character passwords, old session revocation, notification failure isolation')
print(f'PASS {checks} real HTTP assertions against isolated local D1/R2')
