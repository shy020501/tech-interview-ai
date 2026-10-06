'use client';
import { useId, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { MutationResult } from '@/types/authoring';
export function Field({label,children,help}:{label:string;children:ReactNode;help?:string}) {return <label className="block"><span className="block mb-2">{label}</span>{children}{help&&<span className="block muted text-xs mt-2">{help}</span>}</label>;}
export function MultiSelect({label,options,value,onChange,name}:{label:string;options:{id:string;name:string}[];value?:string[];onChange?:(ids:string[])=>void;name?:string}) {return <Field label={label} help="Use Ctrl / ⌘ to select multiple items."><select name={name} multiple size={Math.min(5,Math.max(2,options.length))} {...(value&&onChange?{value,onChange:(e:React.ChangeEvent<HTMLSelectElement>)=>onChange(Array.from(e.target.selectedOptions,o=>o.value))}:{defaultValue:value})}>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>;}
function indentJsonSelection(field:HTMLTextAreaElement,outdent:boolean) {
 const {value,selectionStart:start,selectionEnd:end,selectionDirection:direction}=field;
 if(!outdent&&start===end) {
  field.setRangeText('  ',start,end,'end');
 } else {
  const edits:{at:number;remove:number;insert:string}[]=[];
  const last=end>start&&value[end-1]==='\n'?end-1:end;
  let at=start===0?0:value.lastIndexOf('\n',start-1)+1;
  while(at<=last) {
   const remove=outdent?(value.slice(at).match(/^(?: {1,2}|\t)/)?.[0].length??0):0;
   if(!outdent||remove)edits.push({at,remove,insert:outdent?'':'  '});
   const newline=value.indexOf('\n',at);
   if(newline===-1)break;
   at=newline+1;
  }
  if(!edits.length)return;
  const position=(offset:number)=>offset+edits.reduce((delta,edit)=>offset<edit.at?delta:delta+edit.insert.length-Math.min(edit.remove,offset-edit.at),0);
  for(const edit of [...edits].reverse())field.setRangeText(edit.insert,edit.at,edit.at+edit.remove,'preserve');
  field.setSelectionRange(position(start),position(end),direction);
 }
 // Use the existing React change/validation path, including the parent form's dirty state.
 field.dispatchEvent(new Event('input',{bubbles:true}));
}
export function JsonField({label,value,onChange,help}:{label:string;value:unknown;onChange:(value:unknown)=>void;help:string}) {
 const id=useId(),[text,setText]=useState(JSON.stringify(value,null,2)),allowFocusMove=useRef(false);
 return <Field label={label} help={help}><textarea id={id} rows={8} className="mono text-xs" value={text} aria-describedby={`${id}-keyboard`} onBlur={()=>{allowFocusMove.current=false;}} onKeyDown={event=>{
  if(event.nativeEvent.isComposing||event.ctrlKey||event.metaKey||event.altKey||event.key==='Shift')return;
  if(event.key==='Escape'){allowFocusMove.current=true;return;}
  const moveFocus=allowFocusMove.current;allowFocusMove.current=false;
  if(event.key!=='Tab'||moveFocus)return;
  event.preventDefault();indentJsonSelection(event.currentTarget,event.shiftKey);
 }} onChange={e=>{const raw=e.target.value;setText(raw);try{const parsed=JSON.parse(raw);e.target.setCustomValidity('');onChange(parsed);}catch{e.target.setCustomValidity('Enter valid JSON before saving.');}}}/><span id={`${id}-keyboard`} className="block muted text-xs mt-2">Tab: indent 2 spaces. Shift+Tab: outdent. Press Esc, then Tab or Shift+Tab to move focus.</span></Field>;
}
export function Feedback({result}:{result:MutationResult|null}) {if(!result)return null;return <div role={result.ok?'status':'alert'} className={result.ok?'notice mt-4':'error-text mt-4'}><p>{result.ok?result.message:result.error}</p>{!result.ok&&result.errors&&<ul className="reasoning-list mt-2">{result.errors.map(e=><li key={e}>{e}</li>)}</ul>}{result.ok&&result.warnings&&<ul className="reasoning-list mt-2">{result.warnings.map(w=><li key={w}>{w}</li>)}</ul>}</div>;}
export function useAdminMutation() {
 const [result,setResult]=useState<MutationResult|null>(null),[pending,start]=useTransition(),router=useRouter();
 const run=(operation:()=>Promise<MutationResult>,done?:(result:Extract<MutationResult,{ok:true}>)=>void)=>{setResult(null);start(async()=>{try{const r=await operation();setResult(r);if(r.ok){done?.(r);router.refresh();}}catch{setResult({ok:false,error:'Unable to complete this change. Please reload or try again.'});}});};
 return {result,pending,run,setResult};
}
export const formText=(data:FormData,key:string)=>String(data.get(key)??'');
export const formList=(data:FormData,key:string)=>data.getAll(key).map(String);
export const formScore=(data:FormData,key:string)=>formText(data,key).trim()===''?null:Number(formText(data,key));
