export type Anchor =
    | "top-left"
    | "top-center"
    | "top-right"
    | "middle-left"
    | "middle-center"
    | "middle-right"
    | "bottom-left"
    | "bottom-center"
    | "bottom-right";

export type LayerType = "text" | "avatar" | "image" | "shape";

export type TextAlign = "left" | "center" | "right";

export type TextEffect = "none" | "shadow" | "outline" | "both";

export type AvatarShape = "circle" | "rounded" | "square";

export type ShapeKind = "rect" | "circle" | "line";

export type ImageFit = "cover" | "contain" | "stretch";

export interface ILayerBase {
    id: string;
    type: LayerType;
    name: string;
    anchor: Anchor;
    offsetX: number;
    offsetY: number;
    opacity: number;
    hidden: boolean;
}

export interface ITextLayer extends ILayerBase {
    type: "text";
    text: string;
    font: string;
    size: number;
    color: string;
    bold: boolean;
    italic: boolean;
    align: TextAlign;
    effect: TextEffect;
    effectColor: string;
    maxWidth: number;
}

export interface IAvatarLayer extends ILayerBase {
    type: "avatar";
    size: number;
    shape: AvatarShape;
    border: number;
    borderColor: string;
}

export interface IImageLayer extends ILayerBase {
    type: "image";
    image: string;
    width: number;
    height: number;
    radius: number;
}

export interface IShapeLayer extends ILayerBase {
    type: "shape";
    shape: ShapeKind;
    width: number;
    height: number;
    color: string;
    radius: number;
}

export type WelcomeLayer = ITextLayer | IAvatarLayer | IImageLayer | IShapeLayer;
