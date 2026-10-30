export function applicationUrl(base:string,path:string):string {
  return base.replace(/\/+$/, '')+'/'+path.replace(/^\/+/, '');
}
export function invitationUrl(base:string,key:string):string {
  return applicationUrl(base,'')+'?invite='+encodeURIComponent(key);
}
