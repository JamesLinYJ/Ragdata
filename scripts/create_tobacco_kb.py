#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import requests


DEFAULT_BASE_URL = "http://127.0.0.1:9380"
DEFAULT_DATASET_NAME = "烟草知识库"
DEFAULT_CONTENT_DIR = Path(__file__).resolve().parent.parent / "content" / "tobacco"


def authorization_header() -> dict[str, str]:
    api_key = os.environ.get("RAGFLOW_API_KEY")
    if not api_key:
        raise SystemExit("缺少环境变量 RAGFLOW_API_KEY")
    return {"Authorization": f"Bearer {api_key}"}


def base_url() -> str:
    return os.environ.get("RAGFLOW_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def request_json(method: str, path: str, **kwargs):
    response = requests.request(method, f"{base_url()}/api/v1{path}", headers=authorization_header(), timeout=60, **kwargs)
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != 0:
        raise RuntimeError(payload.get("message", "RAGFlow API 调用失败"))
    return payload["data"]


def find_or_create_dataset(name: str, description: str):
    datasets = request_json("GET", "/datasets", params={"name": name, "page": 1, "page_size": 30})
    if datasets:
        return datasets[0]
    return request_json(
        "POST",
        "/datasets",
        json={
            "name": name,
            "description": description,
            "permission": "me",
            "chunk_method": "naive",
        },
    )


def upload_documents(dataset_id: str, content_dir: Path):
    uploaded = []
    for path in sorted(content_dir.glob("*.md")):
        with path.open("rb") as file_handle:
            response = requests.post(
                f"{base_url()}/api/v1/datasets/{dataset_id}/documents",
                headers=authorization_header(),
                files=[("file", (path.name, file_handle))],
                timeout=120,
            )
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != 0:
            raise RuntimeError(f"上传失败: {path.name}: {payload.get('message')}")
        uploaded.extend(payload["data"])
    return uploaded


def parse_documents(dataset_id: str, document_ids: list[str]):
    request_json("POST", f"/datasets/{dataset_id}/chunks", json={"document_ids": document_ids})


def main() -> int:
    parser = argparse.ArgumentParser(description="创建并导入“烟草知识库”到 RAGFlow")
    parser.add_argument("--name", default=DEFAULT_DATASET_NAME, help="知识库名称")
    parser.add_argument("--content-dir", default=str(DEFAULT_CONTENT_DIR), help="待导入文档目录")
    parser.add_argument("--skip-parse", action="store_true", help="只上传，不触发解析")
    args = parser.parse_args()

    content_dir = Path(args.content_dir).resolve()
    if not content_dir.exists():
        raise SystemExit(f"内容目录不存在: {content_dir}")

    description = "用于演示自定义前端与 RAGFlow 后端联调的烟草知识库"
    dataset = find_or_create_dataset(args.name, description)
    uploaded_docs = upload_documents(dataset["id"], content_dir)

    if uploaded_docs and not args.skip_parse:
        parse_documents(dataset["id"], [doc["id"] for doc in uploaded_docs])

    print(f"dataset_id={dataset['id']}")
    print(f"dataset_name={dataset['name']}")
    print(f"uploaded={len(uploaded_docs)}")
    if uploaded_docs and not args.skip_parse:
        print("parse_started=true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
