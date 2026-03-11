import { db } from "./firebase";
import { doc, updateDoc, getDoc } from "firebase/firestore";

export async function updateStock(productId: string, quantity: number, cost: number) {

  const productRef = doc(db, "produtos", productId);

  const productSnap = await getDoc(productRef);

  if (!productSnap.exists()) {
    console.log("Produto não encontrado");
    return;
  }

  const data = productSnap.data();

  const currentStock = data.stock || 0;
  const currentCost = data.cost || 0;

  const newStock = currentStock + quantity;

  const newCost =
    ((currentStock * currentCost) + (quantity * cost)) / newStock;

  await updateDoc(productRef, {
    stock: newStock,
    cost: newCost
  });

}