import { db } from "../lib/firebase";
import { collection, addDoc } from "firebase/firestore";
import { updateStock } from "../lib/inventory";

export async function registerPurchaseItem(data: {
  productId: string;
  quantity: number;
  cost: number;
  purchaseId: string;
}) {

  await addDoc(collection(db, "purchase_items"), data);

  await updateStock(
    data.productId,
    data.quantity,
    data.cost
  );

}