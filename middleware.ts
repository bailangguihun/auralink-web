import {NextResponse,type NextRequest} from "next/server";
import {configuredCommunityOrigin} from "@/lib/community-host-origin";
/** Next's upgrade handler forwards external rewrites, including the socket head. */
export async function middleware(request:NextRequest){
 const origin=await configuredCommunityOrigin();
 if(!origin)return new NextResponse(null,{status:503});
 const destination=new URL("/ws",origin);
 const ticket=request.nextUrl.searchParams.get("ticket");
 if(ticket)destination.searchParams.set("ticket",ticket);
 return NextResponse.rewrite(destination);
}
export const config={matcher:"/api/community-ws",runtime:"nodejs"};
