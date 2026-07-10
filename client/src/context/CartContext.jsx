import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer
} from "react";
import toast from "react-hot-toast";

import {
  calculateCartSubtotal,
  makeCartItemId
} from "../utils/cartUtils";

const CartContext =
  createContext(null);

const CART_STORAGE_KEY =
  "tap_wrap_cart_v1";

const initialState = {
  items: [],
  discountCode: ""
};

function loadCart() {
  try {
    const savedCart =
      localStorage.getItem(
        CART_STORAGE_KEY
      );

    if (!savedCart) {
      return initialState;
    }

    const parsedCart =
      JSON.parse(savedCart);

    if (
      !Array.isArray(
        parsedCart.items
      )
    ) {
      return initialState;
    }

    return {
      items:
        parsedCart.items,

      discountCode:
        String(
          parsedCart.discountCode ||
            ""
        )
    };
  } catch {
    return initialState;
  }
}

function cartReducer(
  state,
  action
) {
  switch (action.type) {
    case "ADD_ITEM": {
      const incomingItem =
        action.payload;

      const existingItem =
        state.items.find(
          (item) =>
            item.id ===
            incomingItem.id
        );

      if (existingItem) {
        return {
          ...state,

          items:
            state.items.map(
              (item) =>
                item.id ===
                incomingItem.id
                  ? {
                      ...item,

                      quantity:
                        item.quantity +
                        incomingItem.quantity
                    }
                  : item
            )
        };
      }

      return {
        ...state,

        items: [
          incomingItem,
          ...state.items
        ]
      };
    }

    case "UPDATE_QUANTITY": {
      const {
        id,
        quantity
      } = action.payload;

      const safeQuantity =
        Math.max(
          Number(quantity) || 1,
          1
        );

      return {
        ...state,

        items:
          state.items.map(
            (item) =>
              item.id === id
                ? {
                    ...item,
                    quantity:
                      safeQuantity
                  }
                : item
          )
      };
    }

    case "REMOVE_ITEM":
      return {
        ...state,

        items:
          state.items.filter(
            (item) =>
              item.id !==
              action.payload
          )
      };

    case "SET_DISCOUNT_CODE":
      return {
        ...state,

        discountCode:
          String(
            action.payload || ""
          )
            .trim()
            .toUpperCase()
            .replace(/\s+/g, "")
      };

    case "CLEAR_DISCOUNT_CODE":
      return {
        ...state,
        discountCode: ""
      };

    case "CLEAR_CART":
      return initialState;

    default:
      return state;
  }
}

export function CartProvider({
  children
}) {
  const [state, dispatch] =
    useReducer(
      cartReducer,
      initialState,
      loadCart
    );

  useEffect(() => {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify(state)
    );
  }, [state]);

  function addToCart({
    product,
    quantity = 1,
    engraving,
    wrapping
  }) {
    const cartItem = {
      id: makeCartItemId({
        productId:
          product._id,
        engraving,
        wrapping
      }),

      product: {
        _id:
          product._id,

        name:
          product.name,

        slug:
          product.slug,

        price:
          product.price,

        salePrice:
          product.salePrice,

        currentPrice:
          product.currentPrice,

        mainImage:
          product.mainImage,

        category:
          product.category,

        serviceEligibility:
          product
            .serviceEligibility
      },

      quantity: Math.max(
        Number(quantity) || 1,
        1
      ),

      engraving,
      wrapping
    };

    dispatch({
      type: "ADD_ITEM",
      payload: cartItem
    });

    toast.success(
      "Added to cart"
    );
  }

  function updateQuantity(
    id,
    quantity
  ) {
    dispatch({
      type:
        "UPDATE_QUANTITY",

      payload: {
        id,
        quantity
      }
    });
  }

  function removeItem(id) {
    dispatch({
      type: "REMOVE_ITEM",
      payload: id
    });

    toast.success(
      "Removed from cart"
    );
  }

  function setDiscountCode(
    code
  ) {
    dispatch({
      type:
        "SET_DISCOUNT_CODE",

      payload: code
    });
  }

  function clearDiscountCode() {
    dispatch({
      type:
        "CLEAR_DISCOUNT_CODE"
    });
  }

  function clearCart({
    showNotification = false
  } = {}) {
    dispatch({
      type: "CLEAR_CART"
    });

    if (showNotification) {
      toast.success(
        "Cart cleared"
      );
    }
  }

  const value = useMemo(() => {
    const itemCount =
      state.items.reduce(
        (total, item) =>
          total +
          Number(
            item.quantity || 0
          ),
        0
      );

    const subtotal =
      calculateCartSubtotal(
        state.items
      );

    return {
      items:
        state.items,

      itemCount,
      subtotal,

      discountCode:
        state.discountCode,

      addToCart,
      updateQuantity,
      removeItem,
      clearCart,
      setDiscountCode,
      clearDiscountCode
    };
  }, [state]);

  return (
    <CartContext.Provider
      value={value}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context =
    useContext(CartContext);

  if (!context) {
    throw new Error(
      "useCart must be used inside CartProvider"
    );
  }

  return context;
}