import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { formatCurrency } from "@/lib/utils"

export function EstimateView() {

const { id } = useParams()

const [estimate,setEstimate] = useState<any>(null)

useEffect(()=>{

async function loadEstimate(){

const snap = await getDoc(doc(db,"estimates",id!))

if(snap.exists()){
setEstimate({id:snap.id,...snap.data()})
}

}

loadEstimate()

},[])

if(!estimate){

return <div>Carregando orçamento...</div>

}

return(

<div className="max-w-4xl mx-auto space-y-6">

<h1 className="text-2xl font-bold">
Orçamento {estimate.numero}
</h1>

<div className="bg-white border rounded-xl p-6">

<h2 className="font-semibold mb-4">
Cliente
</h2>

<p>{estimate.cliente_nome}</p>
<p>{estimate.cliente_telefone}</p>

</div>

<div className="bg-white border rounded-xl p-6">

<h2 className="font-semibold mb-4">
Itens
</h2>

{estimate.items.map((item:any)=>(
<div
key={item.produto_id}
className="flex justify-between border-b py-2"
>

<span>{item.produto_nome}</span>

<span>
{item.quantidade} x {formatCurrency(item.preco_unitario)}
</span>

<span>{formatCurrency(item.subtotal)}</span>

</div>
))}

</div>

<div className="bg-white border rounded-xl p-6 flex justify-between text-lg font-semibold">

<span>Total</span>

<span className="text-[#6F2738]">
{formatCurrency(estimate.total)}
</span>

</div>

</div>

)

}