import React, { useEffect, useMemo, useState } from 'react';
import { Users, GraduationCap, UserRound, Gauge, Plus, Mail, RotateCw, X, ShieldCheck, CalendarDays, BookOpen, MoreHorizontal, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

const demoInstructors = [
  { _id: 'i1', name: 'Maya Chen', email: 'maya@learnsphere.ai', status: 'active', createdAt: '2026-02-12', courseCount: 6 },
  { _id: 'i2', name: 'Omar Khalid', email: 'omar@learnsphere.ai', status: 'active', createdAt: '2026-04-08', courseCount: 4 },
  { _id: 'i3', name: 'Nadia Rahman', email: 'nadia@learnsphere.ai', status: 'active', createdAt: '2026-06-19', courseCount: 3 }
];

const initialDemo = {
  overview: { totalUsers: 50284, totalStudents: 50280, totalInstructors: 3, capacityUsed: 3, capacityLimit: 5, available: 2 },
  instructors: demoInstructors,
  invitations: []
};

const formatDate = value => value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(value)) : '—';

function StatCard({ icon: Icon, label, value, detail, accent = false }) {
  return <div className="card p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-sm font-bold text-slate-500">{label}</p><p className={`mt-2 text-3xl font-black tracking-tight ${accent ? 'text-spring-700' : 'text-ink'}`}>{value}</p><p className="mt-2 text-xs text-slate-400">{detail}</p></div>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-spring-50 text-spring-700"><Icon size={21}/></span>
    </div>
  </div>;
}

function InviteModal({ available, onClose, onInvite, busy }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const submit = e => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) return setError('Enter a valid email address.');
    setError(''); onInvite(clean);
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="invite-title">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
      <div className="flex items-center justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-spring-50 text-spring-700"><Mail size={23}/></span><button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Close"><X/></button></div>
      <h2 id="invite-title" className="mt-6 text-2xl font-black">Invite an instructor</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">The invitation is email-bound, single-use, and expires after seven days. A pending invitation reserves one instructor slot.</p>
      <label className="mt-6 block"><span className="mb-2 block text-sm font-bold">Email address</span><input autoFocus className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="instructor@example.com" disabled={!available||busy}/></label>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className={`mt-4 rounded-xl p-3 text-xs ${available ? 'bg-spring-50 text-spring-800' : 'bg-amber-50 text-amber-800'}`}><ShieldCheck size={15} className="mr-2 inline"/>{available ? `${available} instructor slot${available===1?'':'s'} available` : 'Capacity is full. Cancel an invitation or remove an instructor to release a slot.'}</div>
      <button disabled={!available||busy} className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40">{busy?<><Loader2 className="animate-spin" size={17}/>Sending…</>:<>Send invitation <Mail size={17}/></>}</button>
    </form>
  </div>;
}

export default function AdminDashboard() {
  const [data, setData] = useState(initialDemo);
  const [tab, setTab] = useState('instructors');
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const isDemo = import.meta.env.VITE_DEMO_MODE === 'true';

  const used = data.instructors.length + data.invitations.filter(x=>x.status==='pending').length;
  const available = Math.max(0, 5-used);
  const overview = useMemo(()=>({...data.overview,totalInstructors:data.instructors.length,capacityUsed:used,capacityLimit:5,available}),[data,used,available]);

  async function load() {
    if (isDemo) return;
    try {
      const [summary, instructorsResult, invitationResult] = await Promise.all([
        api('/admin/overview'), api('/admin/instructors'), api('/admin/instructor-invitations')
      ]);
      setData({
        overview: { totalUsers: summary.users, totalStudents: summary.students, totalInstructors: instructorsResult.instructors.length },
        instructors: instructorsResult.instructors,
        invitations: invitationResult.invitations.filter(x=>x.status==='pending')
      });
    } catch (e) { setNotice({type:'error',text:e.message}); }
  }
  useEffect(()=>{ load(); },[]);

  async function invite(email) {
    if (!available) return;
    if (data.instructors.some(x=>x.email===email)||data.invitations.some(x=>x.email===email&&x.status==='pending')) return setNotice({type:'error',text:'This person is already an instructor or has a pending invitation.'});
    setBusy(true);
    try {
      if (isDemo) {
        const now = new Date(); const expires = new Date(now.getTime()+7*86400000);
        setData(d=>({...d,invitations:[...d.invitations,{_id:String(Date.now()),email,status:'pending',createdAt:now.toISOString(),expiresAt:expires.toISOString(),lastSentAt:now.toISOString()}]}));
      } else { await api('/admin/instructor-invitations',{method:'POST',body:JSON.stringify({email})}); await load(); }
      setModal(false); setTab('invitations'); setNotice({type:'success',text:`Invitation sent to ${email}.`});
    } catch(e) { setNotice({type:'error',text:e.message}); } finally { setBusy(false); }
  }
  async function resend(item) {
    try { if(!isDemo){await api(`/admin/instructor-invitations/${item._id}/resend`,{method:'POST'});await load()} setNotice({type:'success',text:`A new seven-day invitation was sent to ${item.email}.`}); }
    catch(e){setNotice({type:'error',text:e.message})}
  }
  async function cancel(item) {
    try { if(!isDemo){await api(`/admin/instructor-invitations/${item._id}`,{method:'DELETE'});await load()}else setData(d=>({...d,invitations:d.invitations.filter(x=>x._id!==item._id)}));setNotice({type:'success',text:'Invitation cancelled and its slot released.'}); }
    catch(e){setNotice({type:'error',text:e.message})}
  }
  async function removeInstructor(item) {
    if(!window.confirm(`Remove instructor access for ${item.name}? Their account will become a student account.`))return;
    try { if(!isDemo){await api(`/admin/instructors/${item._id}`,{method:'DELETE'});await load()}else setData(d=>({...d,instructors:d.instructors.filter(x=>x._id!==item._id)}));setNotice({type:'success',text:`Instructor access removed for ${item.name}.`}); }
    catch(e){setNotice({type:'error',text:e.message})}
  }

  return <div className="min-h-[calc(100vh-72px)] bg-slate-50">
    <main className="container-page py-7 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Platform administration</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Admin Dashboard</h1><p className="mt-2 text-sm text-slate-500">Manage instructor access and protect platform capacity.</p></div><button onClick={()=>setModal(true)} disabled={!available} className="btn-primary disabled:cursor-not-allowed disabled:opacity-40"><Plus size={17}/>Invite Instructor</button></div>
      {notice&&<div className={`mt-6 flex items-start justify-between gap-3 rounded-xl p-4 text-sm font-semibold ${notice.type==='error'?'bg-red-50 text-red-700':'bg-spring-50 text-spring-800'}`}><span>{notice.type==='error'?<AlertCircle className="mr-2 inline" size={17}/>:<CheckCircle2 className="mr-2 inline" size={17}/>} {notice.text}</span><button onClick={()=>setNotice(null)}><X size={16}/></button></div>}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total Users" value={overview.totalUsers.toLocaleString()} detail="All registered accounts"/>
        <StatCard icon={UserRound} label="Total Students" value={(overview.totalStudents??overview.totalUsers-overview.totalInstructors).toLocaleString()} detail="Default registration role"/>
        <StatCard icon={GraduationCap} label="Total Instructors" value={overview.totalInstructors} detail="Active instructor accounts"/>
        <StatCard icon={Gauge} label="Instructor Capacity" value={`${used} / 5`} detail={`${available} slot${available===1?'':'s'} available`} accent/>
      </div>
      <section className="card mt-7 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5 sm:p-6"><div><h2 className="text-xl font-black">Instructor Management</h2><p className="mt-1 text-sm text-slate-500">Active instructors and reserved invitations count toward the five-seat limit.</p></div><div className="flex gap-2">{['instructors','invitations'].map(x=><button key={x} onClick={()=>setTab(x)} className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${tab===x?'bg-ink text-white':'border bg-white text-slate-500'}`}>{x==='instructors'?`Active (${data.instructors.length})`:`Pending (${data.invitations.length})`}</button>)}</div></div>
        <div className="p-4 sm:p-6">
          {tab==='instructors' ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wider text-slate-400"><th className="pb-3">Name</th><th className="pb-3">Email</th><th className="pb-3">Status</th><th className="pb-3">Joined</th><th className="pb-3">Courses</th><th className="pb-3 text-right">Actions</th></tr></thead><tbody>{data.instructors.map(item=><tr key={item._id} className="border-b last:border-0"><td className="py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-spring-100 text-xs font-black text-spring-800">{item.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</span><strong>{item.name}</strong></div></td><td className="text-slate-500">{item.email}</td><td><span className="rounded-full bg-spring-50 px-3 py-1 text-xs font-bold text-spring-700">{item.status==='suspended'?'Suspended':'Active'}</span></td><td className="text-slate-500">{formatDate(item.createdAt)}</td><td><span className="inline-flex items-center gap-1 font-bold"><BookOpen size={14}/>{item.courseCount??0}</span></td><td className="text-right"><button onClick={()=>removeInstructor(item)} className="rounded-lg border px-3 py-2 text-xs font-bold text-slate-500 hover:border-red-200 hover:text-red-600">Remove access</button></td></tr>)}</tbody></table></div>
          : data.invitations.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wider text-slate-400"><th className="pb-3">Email</th><th className="pb-3">Status</th><th className="pb-3">Invitation date</th><th className="pb-3">Expiration</th><th className="pb-3 text-right">Actions</th></tr></thead><tbody>{data.invitations.map(item=><tr key={item._id} className="border-b last:border-0"><td className="py-4 font-bold">{item.email}</td><td><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Pending</span></td><td className="text-slate-500">{formatDate(item.createdAt)}</td><td className="text-slate-500">{formatDate(item.expiresAt)}</td><td className="text-right"><button onClick={()=>resend(item)} className="mr-2 rounded-lg border px-3 py-2 text-xs font-bold"><RotateCw className="mr-1 inline" size={13}/>Resend</button><button onClick={()=>cancel(item)} className="px-3 py-2 text-xs font-bold text-red-600">Cancel</button></td></tr>)}</tbody></table></div>
          : <div className="py-14 text-center"><Mail className="mx-auto text-slate-300" size={34}/><p className="mt-3 font-bold">No pending invitations</p><p className="mt-1 text-sm text-slate-400">Invitations waiting for acceptance will appear here.</p></div>}
        </div>
      </section>
    </main>
    {modal&&<InviteModal available={available} onClose={()=>setModal(false)} onInvite={invite} busy={busy}/>} 
  </div>;
}
