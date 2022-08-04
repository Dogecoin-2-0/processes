import axios from 'axios';

interface JsonRpcRequestBody {
  method: string;
  params: Array<any>;
}

const rpcCall = (url: string, rpcSpec: JsonRpcRequestBody): Promise<any> => {
  return new Promise((resolve, reject) => {
    axios.post(url, { ...rpcSpec, jsonrpc: '2.0', id: Math.floor(Math.random() * 4) + 1 }).then(response => {
      const { data } = response;

      if (!!data.result) resolve(data.result);
      else if (!!data.error) reject(new Error(data.error.message));
    });
  });
};

export default rpcCall;
