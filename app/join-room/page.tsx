import {redirect} from "next/navigation";
export default async function JoinRoomPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams;
 redirect('/community'+(typeof query.code==='string'?'?code='+encodeURIComponent(query.code):'?view=rooms'));
}
