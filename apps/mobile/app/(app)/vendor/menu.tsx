import type { Allergen, Database } from "@cotto/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { supabase } from "../../../src/lib/supabase";
import { useVendor } from "../../../src/lib/use-vendor";
import { ItemForm, type ItemFormValues } from "../../../src/features/menu-builder/item-form";

type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
type MenuCategory = Database["public"]["Tables"]["menu_categories"]["Row"];

export default function MenuBuilder() {
  const router = useRouter();
  const { data: vendor, isLoading: vendorLoading } = useVendor();
  const queryClient = useQueryClient();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addingItemToCategory, setAddingItemToCategory] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  const vendorId = vendor?.id;

  const categoriesQuery = useQuery({
    queryKey: ["menu_categories", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_categories")
        .select("*")
        .eq("vendor_id", vendorId!)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const itemsQuery = useQuery({
    // "all" (editor sees hidden items too) vs. preview.tsx's "published"
    // (customer-facing, is_available only) -- must stay distinct, or
    // React Query's shared cache serves one screen's result to the other.
    queryKey: ["menu_items", vendorId, "all"],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("vendor_id", vendorId!)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  async function refreshCategories() {
    await queryClient.invalidateQueries({ queryKey: ["menu_categories", vendorId] });
  }
  async function refreshItems() {
    await queryClient.invalidateQueries({ queryKey: ["menu_items", vendorId, "all"] });
  }

  async function addCategory() {
    if (!newCategoryName.trim() || !vendorId) return;
    await supabase.from("menu_categories").insert({
      vendor_id: vendorId,
      name: newCategoryName.trim(),
      sort_order: categoriesQuery.data?.length ?? 0,
    });
    setNewCategoryName("");
    setAddingCategory(false);
    await refreshCategories();
  }

  async function renameCategory(id: string) {
    if (!renameValue.trim()) return;
    await supabase.from("menu_categories").update({ name: renameValue.trim() }).eq("id", id);
    setRenamingId(null);
    await refreshCategories();
  }

  async function deleteCategory(id: string) {
    await supabase.from("menu_categories").delete().eq("id", id);
    await refreshCategories();
    await refreshItems();
  }

  async function moveCategory(category: MenuCategory, direction: -1 | 1) {
    const list = categoriesQuery.data ?? [];
    const index = list.findIndex((c) => c.id === category.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= list.length) return;
    const other = list[swapIndex];
    await supabase.from("menu_categories").update({ sort_order: other.sort_order }).eq("id", category.id);
    await supabase.from("menu_categories").update({ sort_order: category.sort_order }).eq("id", other.id);
    await refreshCategories();
  }

  async function saveNewItem(categoryId: string, values: ItemFormValues) {
    if (!vendorId) return;
    const itemsInCategory = itemsQuery.data?.filter((i) => i.menu_category_id === categoryId) ?? [];
    const { error } = await supabase.from("menu_items").insert({
      vendor_id: vendorId,
      menu_category_id: categoryId,
      name: values.name,
      description: values.description || null,
      ingredients: values.ingredients || null,
      price_cents: Math.round(Number(values.priceDollars) * 100),
      allergens: values.allergens,
      image_urls: values.imageUrls,
      sort_order: itemsInCategory.length,
    });
    if (error) throw error;
    setAddingItemToCategory(null);
    await refreshItems();
  }

  async function saveEditedItem(item: MenuItem, values: ItemFormValues) {
    const { error } = await supabase
      .from("menu_items")
      .update({
        name: values.name,
        description: values.description || null,
        ingredients: values.ingredients || null,
        price_cents: Math.round(Number(values.priceDollars) * 100),
        allergens: values.allergens as Allergen[],
        image_urls: values.imageUrls,
      })
      .eq("id", item.id);
    if (error) throw error;
    setEditingItem(null);
    await refreshItems();
  }

  async function deleteItem(id: string) {
    await supabase.from("menu_items").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    await refreshItems();
  }

  async function toggleAvailable(item: MenuItem) {
    await supabase.from("menu_items").update({ is_available: !item.is_available }).eq("id", item.id);
    await refreshItems();
  }

  async function toggleSoldOut(item: MenuItem) {
    await supabase.from("menu_items").update({ is_sold_out: !item.is_sold_out }).eq("id", item.id);
    await refreshItems();
  }

  if (vendorLoading || !vendor || categoriesQuery.isLoading || itemsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cotto-dark">
        <ActivityIndicator color="#D96A3E" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-cotto-dark" contentContainerStyle={{ padding: 24, paddingTop: 56, paddingBottom: 96, gap: 16 }}>
      <Pressable onPress={() => router.back()}>
        <Text className="text-white/60">&larr; Back</Text>
      </Pressable>
      <Text className="text-2xl font-bold text-white">Menu</Text>

      {categoriesQuery.data?.map((category, index) => (
        <View key={category.id} className="gap-2 rounded-lg bg-white/5 p-3">
          <View className="flex-row items-center gap-2">
            {renamingId === category.id ? (
              <TextInput
                className="flex-1 rounded-md bg-white/10 px-2 py-1 text-white"
                value={renameValue}
                onChangeText={setRenameValue}
                onSubmitEditing={() => renameCategory(category.id)}
                autoFocus
              />
            ) : (
              <Text className="flex-1 text-lg font-semibold text-white">{category.name}</Text>
            )}
            <Pressable disabled={index === 0} onPress={() => moveCategory(category, -1)}>
              <Text className={index === 0 ? "text-white/20" : "text-white/70"}>Up</Text>
            </Pressable>
            <Pressable disabled={index === (categoriesQuery.data?.length ?? 1) - 1} onPress={() => moveCategory(category, 1)}>
              <Text className={index === (categoriesQuery.data?.length ?? 1) - 1 ? "text-white/20" : "text-white/70"}>Down</Text>
            </Pressable>
            {renamingId === category.id ? (
              <Pressable onPress={() => renameCategory(category.id)}>
                <Text className="text-cotto-accent">Save</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  setRenamingId(category.id);
                  setRenameValue(category.name);
                }}
              >
                <Text className="text-white/70">Rename</Text>
              </Pressable>
            )}
            <Pressable onPress={() => deleteCategory(category.id)}>
              <Text className="text-red-400">Delete</Text>
            </Pressable>
          </View>

          {itemsQuery.data
            ?.filter((item) => item.menu_category_id === category.id)
            .map((item) =>
              editingItem?.id === item.id ? (
                <ItemForm
                  key={item.id}
                  vendorId={vendor.id}
                  existing={item}
                  onCancel={() => setEditingItem(null)}
                  onSave={(values) => saveEditedItem(item, values)}
                />
              ) : (
                <View key={item.id} className="flex-row items-center gap-2 rounded-md bg-white/5 p-2">
                  <View className="flex-1">
                    <Text className="text-white">{item.name}</Text>
                    <Text className="text-sm text-white/60">${(item.price_cents / 100).toFixed(2)}</Text>
                  </View>
                  {item.is_sold_out && (
                    <View className="rounded-full bg-red-500/20 px-2 py-0.5">
                      <Text className="text-xs text-red-400">Sold out</Text>
                    </View>
                  )}
                  <Pressable onPress={() => toggleSoldOut(item)}>
                    <Text className="text-white/70">{item.is_sold_out ? "Mark in stock" : "Mark sold out"}</Text>
                  </Pressable>
                  <Pressable onPress={() => toggleAvailable(item)}>
                    <Text className="text-white/70">{item.is_available ? "Hide" : "Show"}</Text>
                  </Pressable>
                  <Pressable onPress={() => setEditingItem(item)}>
                    <Text className="text-cotto-accent">Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => deleteItem(item.id)}>
                    <Text className="text-red-400">Delete</Text>
                  </Pressable>
                </View>
              )
            )}

          {addingItemToCategory === category.id ? (
            <ItemForm
              vendorId={vendor.id}
              onCancel={() => setAddingItemToCategory(null)}
              onSave={(values) => saveNewItem(category.id, values)}
            />
          ) : (
            <Pressable
              className="items-center rounded-md border border-white/20 py-2"
              onPress={() => setAddingItemToCategory(category.id)}
            >
              <Text className="text-white">+ Add item</Text>
            </Pressable>
          )}
        </View>
      ))}

      {addingCategory ? (
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 rounded-md bg-white/10 px-3 py-2 text-white"
            placeholder="Category name"
            placeholderTextColor="#9CA3AF"
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            onSubmitEditing={addCategory}
            autoFocus
          />
          <Pressable className="items-center justify-center rounded-md bg-cotto-accent px-4" onPress={addCategory}>
            <Text className="font-semibold text-white">Add</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable className="items-center rounded-lg border border-white/20 py-3" onPress={() => setAddingCategory(true)}>
          <Text className="text-white">+ Add category</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}
