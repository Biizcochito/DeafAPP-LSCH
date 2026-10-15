// Usa los tokens de ui/theme.css; la aplicación nativa conserva sus estilos.
const colors={ '#0F0F1E':'transparent','#1A1A2E':'var(--surface)','#171729':'var(--raised)','#241E2E':'var(--raised)','#FFF':'var(--cream)','#DDD':'var(--cream)','#E2E2EA':'var(--cream)','#D0D0DF':'var(--cream)','#AAAABC':'var(--muted)','#AAA':'var(--muted)','#55556A':'var(--line-2)','#343447':'var(--line)','#44445A':'var(--line)','#23877F':'var(--lime)','#4ECDC4':'var(--lime)','#9EDDD7':'var(--mint)','#77DECF':'var(--mint)','#D8BD84':'var(--coral)','#C8B98E':'var(--coral)','#FF9BAD':'var(--coral)','#AD304A':'var(--coral)' };
const display={fontFamily:'var(--display)',fontWeight:'700',letterSpacing:-.7};
const pill={backgroundColor:'var(--lime)',borderColor:'var(--lime)',borderWidth:1,borderRadius:999,minHeight:46,paddingVertical:12,paddingHorizontal:18,alignItems:'center',justifyContent:'center',maxWidth:'100%'};
const roles={
 root:{backgroundColor:'transparent',minHeight:0,minWidth:0},
 content:{maxWidth:1240,padding:24,paddingBottom:120},
 title:{...display,fontSize:44,lineHeight:48,letterSpacing:-1.8,minWidth:0},
 subtitle:{...display,fontSize:25,lineHeight:29,marginBottom:4},
 cardTitle:{...display,fontSize:23,lineHeight:28},
 rowTitle:{fontFamily:'var(--body)',fontWeight:'650',fontSize:16},
 body:{fontSize:14,lineHeight:23},muted:{fontSize:13,lineHeight:22},note:{fontSize:13,lineHeight:22},
 card:{backgroundColor:'var(--surface)',borderWidth:1,borderColor:'var(--line)',borderRadius:28,padding:24,marginVertical:10},
 input:{backgroundColor:'var(--raised)',borderColor:'var(--line-2)',borderRadius:20,minHeight:54,paddingHorizontal:18,paddingVertical:14,fontSize:16},
 action:pill,button:pill,actionText:{color:'var(--ink)',fontWeight:'650',fontSize:13,lineHeight:20},buttonText:{color:'var(--ink)',fontWeight:'650',fontSize:13,lineHeight:20},
 secondary:{backgroundColor:'var(--raised)',borderColor:'var(--line-2)'},secondaryText:{color:'var(--cream)'},
 danger:{backgroundColor:'var(--coral)',borderColor:'var(--coral)'},
 row:{borderWidth:1,borderColor:'var(--line)',borderRadius:24,padding:18,gap:12},
 stat:{borderRadius:26,padding:22},statNumber:{...display,fontSize:46,lineHeight:51},number:{...display,color:'var(--lime)',fontSize:36,lineHeight:42},
 tab:{borderWidth:1,borderColor:'var(--line-2)',borderRadius:999,paddingVertical:12,paddingHorizontal:18,minHeight:46,justifyContent:'center',backgroundColor:'var(--surface)'},
 activeTab:{backgroundColor:'var(--lime)',borderColor:'var(--lime)'},tabText:{color:'var(--muted)',fontSize:13,fontWeight:'650',fontFamily:'var(--body)'},activeTabText:{color:'var(--ink)'},
 eyebrow:{fontFamily:'var(--body)',fontSize:11,fontWeight:'650',letterSpacing:1.5,color:'var(--lime)',marginBottom:12},
 pageLead:{fontFamily:'var(--body)',fontSize:15,lineHeight:24,color:'var(--muted)',marginTop:10,marginBottom:12},
 pendingStat:{backgroundColor:'var(--sky)',minWidth:72},approvedStat:{backgroundColor:'var(--lime)',minWidth:72},rejectedStat:{backgroundColor:'var(--coral)',minWidth:72},
 statInk:{color:'var(--ink)'},statLabel:{fontFamily:'var(--body)',color:'var(--ink)',fontSize:13,lineHeight:22},
 section:{...display,fontSize:25,lineHeight:30},header:{maxWidth:1240},
 notice:{borderRadius:20},more:{borderColor:'var(--line-2)',borderRadius:999,minHeight:48},
};
export function adminTheme(styles) {
 const themed={};
 for(const [key,style] of Object.entries(styles)) {
   const mapped=Object.fromEntries(Object.entries(style).map(([property,value])=>[property,typeof value==='string'&&colors[value]||value]));
   if('color' in mapped || key==='input') mapped.fontFamily='var(--body)';
   themed[key]={...mapped,...roles[key]};
 }
 for(const [key,style] of Object.entries(roles)) if(!themed[key]) themed[key]=style;
 return themed;
}
