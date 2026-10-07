import { Package, Users, ClipboardList } from "lucide-react";

export const IMPORT_TYPES = {
  products: {
    label: "Products",
    icon: Package,
    endpoint: "/products/import",
    columnHint: "Supplier price-list columns: Product name, Product code, Unit pack size, Units per carton, Unit Price (cost), Selling Price Excl VAT, Selling Price Incl VAT.",
    invalidateKeys: [["products"]],
    createdLabel: "created",
    updatedLabel: "updated",
  },
  clients: {
    label: "Clients",
    icon: Users,
    endpoint: "/clients/import",
    columnHint: "Recognises common column names like Name, Email, Phone, Address, Farm Name - in any order.",
    invalidateKeys: [["clients"]],
    createdLabel: "created",
    updatedLabel: "updated",
  },
  programs: {
    label: "Herding Programs",
    icon: ClipboardList,
    endpoint: "/programs/import",
    columnHint: "One row per animal type: Client (name or email), Program Name, Animal Type, Count. Goal/Start Date/End Date are optional. The client must already exist.",
    invalidateKeys: [["programs"]],
    createdLabel: "programs created",
    updatedLabel: "animal groups added or changed",
  },
};
